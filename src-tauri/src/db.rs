use crate::domain::{DailySummary, SessionSnapshot, SessionStatus, StudySessionRecord};
use chrono::{DateTime, Duration as ChronoDuration, Local};
use rusqlite::{Connection, Result, Row, params};
use std::fs;
use std::path::Path;

pub fn init_db(app_data_dir: &Path) -> Result<(Connection, Vec<StudySessionRecord>)> {
    fs::create_dir_all(app_data_dir)
        .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;

    let db_path = app_data_dir.join("study_chrono.db");
    let conn = Connection::open(&db_path)?;

    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;
    init_schema(&conn)?;

    let recovered = recover_dangling_sessions(&conn)?;
    Ok((conn, recovered))
}

pub fn checkpoint_wal(conn: &Connection) -> Result<()> {
    conn.query_row("PRAGMA wal_checkpoint(TRUNCATE);", [], |_| Ok(()))
}

pub fn init_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS study_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            study_date TEXT NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT,
            subject TEXT NOT NULL,
            topic TEXT NOT NULL DEFAULT '',
            time_reading_sec INTEGER NOT NULL DEFAULT 0,
            time_media_sec INTEGER NOT NULL DEFAULT 0,
            time_review_sec INTEGER NOT NULL DEFAULT 0,
            time_questions_sec INTEGER NOT NULL DEFAULT 0,
            time_paused_sec INTEGER NOT NULL DEFAULT 0,
            total_active_sec INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'IN_PROGRESS'
        );

        CREATE INDEX IF NOT EXISTS idx_study_sessions_date ON study_sessions(study_date);
        CREATE INDEX IF NOT EXISTS idx_study_sessions_subject ON study_sessions(subject);
        "#,
    )
}

fn map_session_row(row: &Row<'_>) -> Result<StudySessionRecord> {
    Ok(StudySessionRecord {
        id: row.get(0)?,
        study_date: row.get(1)?,
        start_time: row.get(2)?,
        end_time: row.get(3)?,
        subject: row.get(4)?,
        topic: row.get(5)?,
        time_reading_sec: row.get::<_, i64>(6)?.max(0) as u64,
        time_media_sec: row.get::<_, i64>(7)?.max(0) as u64,
        time_review_sec: row.get::<_, i64>(8)?.max(0) as u64,
        time_questions_sec: row.get::<_, i64>(9)?.max(0) as u64,
        time_paused_sec: row.get::<_, i64>(10)?.max(0) as u64,
        total_active_sec: row.get::<_, i64>(11)?.max(0) as u64,
        status: row.get(12)?,
    })
}

fn compute_checkpoint_end_time(
    start_time: &str,
    total_active_sec: u64,
    time_paused_sec: u64,
) -> String {
    if let Ok(parsed_start) = DateTime::parse_from_rfc3339(start_time) {
        let elapsed_secs = total_active_sec.saturating_add(time_paused_sec) as i64;
        return (parsed_start + ChronoDuration::seconds(elapsed_secs)).to_rfc3339();
    }
    Local::now().to_rfc3339()
}

/// RN05 — Auto-Recuperação de Queda de Energia (Crash Recovery).
/// Sessões `IN_PROGRESS` com `total_active_sec > 0` são convertidas para `RECOVERED`
/// com `end_time` definido para o último checkpoint conhecido.
/// Sessões órfãs sem tempo ativo (`total_active_sec == 0`) são removidas.
pub fn recover_dangling_sessions(conn: &Connection) -> Result<Vec<StudySessionRecord>> {
    let tx = conn.unchecked_transaction()?;

    tx.execute(
        "DELETE FROM study_sessions WHERE status = 'IN_PROGRESS' AND total_active_sec <= 0;",
        [],
    )?;

    let dangling: Vec<StudySessionRecord> = {
        let mut stmt = tx.prepare(
            r#"
            SELECT
                id, study_date, start_time, end_time, subject, topic,
                time_reading_sec, time_media_sec, time_review_sec, time_questions_sec,
                time_paused_sec, total_active_sec, status
            FROM study_sessions
            WHERE status = 'IN_PROGRESS' AND total_active_sec > 0
            ORDER BY id ASC;
            "#,
        )?;

        stmt.query_map([], map_session_row)?
            .collect::<Result<Vec<_>>>()?
    };

    let mut recovered = Vec::with_capacity(dangling.len());
    for mut session in dangling {
        let checkpoint_end = compute_checkpoint_end_time(
            &session.start_time,
            session.total_active_sec,
            session.time_paused_sec,
        );
        tx.execute(
            r#"
            UPDATE study_sessions
            SET status = ?1, end_time = ?2
            WHERE id = ?3
            "#,
            params![
                SessionStatus::Recovered.as_str(),
                &checkpoint_end,
                session.id
            ],
        )?;
        session.status = SessionStatus::Recovered.as_str().to_string();
        session.end_time = Some(checkpoint_end);
        recovered.push(session);
    }

    tx.commit()?;
    Ok(recovered)
}

pub fn get_distinct_subjects(conn: &Connection) -> Result<Vec<String>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT DISTINCT subject
        FROM study_sessions
        WHERE subject != ''
        ORDER BY subject COLLATE NOCASE ASC;
        "#,
    )?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
    rows.collect()
}

pub fn create_session(
    conn: &Connection,
    study_date: &str,
    start_time: &str,
    subject: &str,
    topic: &str,
) -> Result<i64> {
    conn.execute(
        r#"
        INSERT INTO study_sessions (study_date, start_time, subject, topic, status)
        VALUES (?1, ?2, ?3, ?4, ?5)
        "#,
        params![
            study_date,
            start_time,
            subject,
            topic,
            SessionStatus::InProgress.as_str()
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn checkpoint_session(
    conn: &Connection,
    id: i64,
    subject: &str,
    topic: &str,
    snapshot: &SessionSnapshot,
) -> Result<()> {
    conn.execute(
        r#"
        UPDATE study_sessions
        SET
            subject = ?1,
            topic = ?2,
            time_reading_sec = ?3,
            time_media_sec = ?4,
            time_review_sec = ?5,
            time_questions_sec = ?6,
            time_paused_sec = ?7,
            total_active_sec = ?8
        WHERE id = ?9 AND status = 'IN_PROGRESS'
        "#,
        params![
            subject,
            topic,
            snapshot.reading_sec as i64,
            snapshot.media_sec as i64,
            snapshot.review_sec as i64,
            snapshot.questions_sec as i64,
            snapshot.paused_sec as i64,
            snapshot.total_active_sec as i64,
            id,
        ],
    )?;
    Ok(())
}

pub fn update_metadata(conn: &Connection, id: i64, subject: &str, topic: &str) -> Result<()> {
    conn.execute(
        r#"
        UPDATE study_sessions
        SET subject = ?1, topic = ?2
        WHERE id = ?3 AND status = 'IN_PROGRESS'
        "#,
        params![subject, topic, id],
    )?;
    Ok(())
}

pub fn finalize_session(
    conn: &Connection,
    id: i64,
    end_time: &str,
    subject: &str,
    topic: &str,
    snapshot: &SessionSnapshot,
) -> Result<()> {
    conn.execute(
        r#"
        UPDATE study_sessions
        SET
            end_time = ?1,
            subject = ?2,
            topic = ?3,
            time_reading_sec = ?4,
            time_media_sec = ?5,
            time_review_sec = ?6,
            time_questions_sec = ?7,
            time_paused_sec = ?8,
            total_active_sec = ?9,
            status = ?10
        WHERE id = ?11
        "#,
        params![
            end_time,
            subject,
            topic,
            snapshot.reading_sec as i64,
            snapshot.media_sec as i64,
            snapshot.review_sec as i64,
            snapshot.questions_sec as i64,
            snapshot.paused_sec as i64,
            snapshot.total_active_sec as i64,
            SessionStatus::Completed.as_str(),
            id,
        ],
    )?;
    Ok(())
}

pub fn get_daily_sessions(conn: &Connection, study_date: &str) -> Result<Vec<StudySessionRecord>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT
            id, study_date, start_time, end_time, subject, topic,
            time_reading_sec, time_media_sec, time_review_sec, time_questions_sec,
            time_paused_sec, total_active_sec, status
        FROM study_sessions
        WHERE study_date = ?1 AND status != 'IN_PROGRESS'
        ORDER BY start_time DESC, id DESC;
        "#,
    )?;
    let rows = stmt.query_map(params![study_date], map_session_row)?;
    rows.collect()
}

pub fn get_daily_summary(conn: &Connection, study_date: &str) -> Result<DailySummary> {
    let sessions = get_daily_sessions(conn, study_date)?;
    let subjects = get_distinct_subjects(conn)?;

    let mut total_reading_sec = 0;
    let mut total_media_sec = 0;
    let mut total_review_sec = 0;
    let mut total_questions_sec = 0;
    let mut total_paused_sec = 0;
    let mut total_active_sec = 0;

    for s in &sessions {
        total_reading_sec += s.time_reading_sec;
        total_media_sec += s.time_media_sec;
        total_review_sec += s.time_review_sec;
        total_questions_sec += s.time_questions_sec;
        total_paused_sec += s.time_paused_sec;
        total_active_sec += s.total_active_sec;
    }

    Ok(DailySummary {
        study_date: study_date.to_string(),
        sessions,
        total_reading_sec,
        total_media_sec,
        total_review_sec,
        total_questions_sec,
        total_paused_sec,
        total_active_sec,
        subjects,
    })
}

pub fn get_all_completed_sessions(conn: &Connection) -> Result<Vec<StudySessionRecord>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT
            id, study_date, start_time, end_time, subject, topic,
            time_reading_sec, time_media_sec, time_review_sec, time_questions_sec,
            time_paused_sec, total_active_sec, status
        FROM study_sessions
        WHERE status != 'IN_PROGRESS'
        ORDER BY study_date DESC, start_time DESC, id DESC;
        "#,
    )?;
    let rows = stmt.query_map([], map_session_row)?;
    rows.collect()
}

pub fn update_completed_session(
    conn: &Connection,
    id: i64,
    subject: &str,
    topic: &str,
) -> Result<bool> {
    let affected = conn.execute(
        r#"
        UPDATE study_sessions
        SET subject = ?1, topic = ?2
        WHERE id = ?3 AND status != 'IN_PROGRESS'
        "#,
        params![subject, topic, id],
    )?;
    Ok(affected > 0)
}

pub fn delete_completed_session(conn: &Connection, id: i64) -> Result<bool> {
    let affected = conn.execute(
        r#"
        DELETE FROM study_sessions
        WHERE id = ?1 AND status != 'IN_PROGRESS'
        "#,
        params![id],
    )?;
    Ok(affected > 0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::Modality;

    fn setup_mem_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();
        conn
    }

    fn make_snapshot(
        reading: u64,
        media: u64,
        review: u64,
        questions: u64,
        paused: u64,
    ) -> SessionSnapshot {
        let total_active = reading + media + review + questions;
        SessionSnapshot {
            status: "running".to_string(),
            active_modality: Some(Modality::Reading),
            last_modality: Some(Modality::Reading),
            subject: "Direito Constitucional".to_string(),
            topic: "Controle".to_string(),
            reading_sec: reading,
            media_sec: media,
            review_sec: review,
            questions_sec: questions,
            paused_sec: paused,
            total_active_sec: total_active,
            total_active_ms: total_active * 1000,
            current_slice_sec: 0,
        }
    }

    #[test]
    fn crud_lifecycle_and_daily_summary() {
        let conn = setup_mem_db();
        let date = "2026-10-29";

        let id1 = create_session(
            &conn,
            date,
            "2026-10-29T08:00:00-03:00",
            "RLM",
            "Proposições",
        )
        .unwrap();

        // Enquanto IN_PROGRESS, não aparece no histórico concluído do dia
        assert!(get_daily_sessions(&conn, date).unwrap().is_empty());

        let snap1 = make_snapshot(600, 1200, 0, 900, 120);
        checkpoint_session(&conn, id1, "RLM", "Proposições", &snap1).unwrap();
        update_metadata(&conn, id1, "Raciocínio Lógico", "Tabela Verdade").unwrap();

        finalize_session(
            &conn,
            id1,
            "2026-10-29T08:47:00-03:00",
            "Raciocínio Lógico",
            "Tabela Verdade",
            &snap1,
        )
        .unwrap();

        let id2 = create_session(
            &conn,
            date,
            "2026-10-29T10:00:00-03:00",
            "Direito Administrativo",
            "Atos Administrativos",
        )
        .unwrap();
        let snap2 = make_snapshot(300, 0, 300, 600, 60);
        finalize_session(
            &conn,
            id2,
            "2026-10-29T10:21:00-03:00",
            "Direito Administrativo",
            "Atos Administrativos",
            &snap2,
        )
        .unwrap();

        let summary = get_daily_summary(&conn, date).unwrap();
        assert_eq!(summary.sessions.len(), 2);
        // Ordenado por start_time DESC (a sessão das 10:00 vem primeiro)
        assert_eq!(summary.sessions[0].subject, "Direito Administrativo");
        assert_eq!(summary.sessions[1].subject, "Raciocínio Lógico");
        assert_eq!(summary.sessions[1].topic, "Tabela Verdade");
        assert_eq!(summary.total_reading_sec, 900);
        assert_eq!(summary.total_media_sec, 1200);
        assert_eq!(summary.total_review_sec, 300);
        assert_eq!(summary.total_questions_sec, 1500);
        assert_eq!(summary.total_paused_sec, 180);
        assert_eq!(summary.total_active_sec, 3900);
        assert_eq!(
            summary.subjects,
            vec![
                "Direito Administrativo".to_string(),
                "Raciocínio Lógico".to_string()
            ]
        );
    }

    #[test]
    fn crash_recovery_promotes_active_sessions_and_cleans_zero_sec_orphans() {
        let conn = setup_mem_db();
        let date = "2026-10-29";

        // Sessão órfã com 0s ativo -> deve ser removida
        let _orphan_id = create_session(
            &conn,
            date,
            "2026-10-29T07:00:00-03:00",
            "Português",
            "Crase",
        )
        .unwrap();

        // Sessão interrompida com 1800s ativos e 300s de pausa (35 min totais desde 14:00:00)
        let active_id = create_session(
            &conn,
            date,
            "2026-10-29T14:00:00-03:00",
            "Direito Constitucional",
            "Poder Constituinte",
        )
        .unwrap();
        let snap = make_snapshot(1200, 0, 0, 600, 300);
        checkpoint_session(
            &conn,
            active_id,
            "Direito Constitucional",
            "Poder Constituinte",
            &snap,
        )
        .unwrap();

        let recovered = recover_dangling_sessions(&conn).unwrap();
        assert_eq!(recovered.len(), 1);
        assert_eq!(recovered[0].id, active_id);
        assert_eq!(recovered[0].status, "RECOVERED");
        // 14:00:00 + 2100s (35m) = 14:35:00-03:00
        assert_eq!(
            recovered[0].end_time.as_deref(),
            Some("2026-10-29T14:35:00-03:00")
        );

        let sessions = get_daily_sessions(&conn, date).unwrap();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].status, "RECOVERED");
        assert_eq!(sessions[0].total_active_sec, 1800);

        // Português (órfã de 0s) não deve poluir o autocomplete
        let subjects = get_distinct_subjects(&conn).unwrap();
        assert_eq!(subjects, vec!["Direito Constitucional".to_string()]);
    }

    #[test]
    fn init_db_creates_directory_and_checkpoint_wal_truncates_wal_file() {
        let temp_dir = std::env::temp_dir().join(format!(
            "study_chrono_test_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let (conn, recovered) = init_db(&temp_dir).unwrap();
        assert!(recovered.is_empty());

        let db_file = temp_dir.join("study_chrono.db");
        let wal_file = temp_dir.join("study_chrono.db-wal");
        assert!(db_file.exists());

        let id = create_session(
            &conn,
            "2026-10-29",
            "2026-10-29T10:00:00-03:00",
            "Matemática",
            "Funções",
        )
        .unwrap();
        let snap = make_snapshot(900, 0, 0, 0, 0);
        finalize_session(
            &conn,
            id,
            "2026-10-29T10:15:00-03:00",
            "Matemática",
            "Funções",
            &snap,
        )
        .unwrap();

        checkpoint_wal(&conn).unwrap();
        if wal_file.exists() {
            assert_eq!(fs::metadata(&wal_file).unwrap().len(), 0);
        }

        // Copia apenas o arquivo único .db (simulando backup antes de Drop) e valida leitura
        let backup_file = temp_dir.join("backup_only.db");
        fs::copy(&db_file, &backup_file).unwrap();
        let backup_conn = Connection::open(&backup_file).unwrap();
        let sessions = get_daily_sessions(&backup_conn, "2026-10-29").unwrap();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].subject, "Matemática");
        assert_eq!(sessions[0].total_active_sec, 900);

        drop(backup_conn);
        drop(conn);
        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn history_all_completed_edit_and_delete_protect_in_progress_sessions() {
        let conn = setup_mem_db();
        let snap = make_snapshot(1200, 600, 0, 0, 60);

        let id_day1 = create_session(
            &conn,
            "2026-10-27",
            "2026-10-27T09:00:00-03:00",
            "RLM",
            "Lógica",
        )
        .unwrap();
        finalize_session(
            &conn,
            id_day1,
            "2026-10-27T09:31:00-03:00",
            "RLM",
            "Lógica",
            &snap,
        )
        .unwrap();

        let id_day2 = create_session(
            &conn,
            "2026-10-29",
            "2026-10-29T14:00:00-03:00",
            "Português",
            "Sintaxe",
        )
        .unwrap();
        finalize_session(
            &conn,
            id_day2,
            "2026-10-29T14:31:00-03:00",
            "Português",
            "Sintaxe",
            &snap,
        )
        .unwrap();

        let id_in_progress = create_session(
            &conn,
            "2026-10-29",
            "2026-10-29T16:00:00-03:00",
            "Direito Penal",
            "Teoria do Crime",
        )
        .unwrap();

        // Ordena por study_date DESC, start_time DESC e exclui IN_PROGRESS
        let all = get_all_completed_sessions(&conn).unwrap();
        assert_eq!(all.len(), 2);
        assert_eq!(all[0].id, id_day2);
        assert_eq!(all[1].id, id_day1);

        // Não permite editar nem excluir sessão IN_PROGRESS pelas rotinas do histórico
        assert!(!update_completed_session(&conn, id_in_progress, "Outra", "Outro").unwrap());
        assert!(!delete_completed_session(&conn, id_in_progress).unwrap());
        assert!(!update_completed_session(&conn, 99999, "Outra", "Outro").unwrap());
        assert!(!delete_completed_session(&conn, 99999).unwrap());

        // Edita sessão concluída
        assert!(
            update_completed_session(&conn, id_day1, "Raciocínio Lógico", "Tabela Verdade")
                .unwrap()
        );
        let after_edit = get_all_completed_sessions(&conn).unwrap();
        assert_eq!(after_edit[1].subject, "Raciocínio Lógico");
        assert_eq!(after_edit[1].topic, "Tabela Verdade");

        // Exclui sessão concluída
        assert!(delete_completed_session(&conn, id_day2).unwrap());
        let after_delete = get_all_completed_sessions(&conn).unwrap();
        assert_eq!(after_delete.len(), 1);
        assert_eq!(after_delete[0].id, id_day1);
    }
}
