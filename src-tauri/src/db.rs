use rusqlite::{params, Connection, Result};
use std::fs;
use chrono::Local;
use std::path::Path;

pub fn init_db(app_data_dir: &Path) -> Result<Connection> {
    // 1 - Criar diretório caso não exista.
    fs::create_dir_all(app_data_dir)
        .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    // 2 - Construir caminho completo do arquivo.
    let db_path = app_data_dir.join("study_chrono.db");
    // 3 - Abrir a conexão com Connection::open, utilizando o operador `?`
    let conn = Connection::open(db_path)?;
    // 4 - Executar o DDL
    conn.execute_batch(r#"
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
    "#)?;
    // 5 - Invocando a função de recuperação de sessões
    recover_dangling_sessions(&conn)?;
    // 6 - Retornar Ok
    println!("Banco de Dados inicializado com sucesso em: {:?}", db_path);
    Ok(conn)
}

// Função para atualizar status das sessões pendentes em caso de encerramento inesperado.
pub fn recover_dangling_sessions(conn: &Connection) -> Result<usize> {
    let now = Local::now().to_rfc3339();
    conn.execute(
        r#"
        UPDATE study_sessions    
        SET 
            status = CASE WHEN total_active_sec > 0 THEN 'RECOVERED' ELSE 'CANCELLED' END,
            end_time = ?1
        WHERE status = 'IN_PROGRESS'     
        "#, 
        params![now],
    )
} 

//Função para autocompletar o campo de matérias
pub fn get_distinct_subjects(conn: &Connection) -> Result<Vec<String>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT DISTINCT subject 
        FROM study_sessions
        WHERE subject != ''
        ORDER BY subject ASC;
        "#
    )?;
    let rows = stmt.query_map([], |row| {
        row.get::<_, String>(0)
    })?;
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
            VALUES (?1, ?2, ?3, ?4, 'IN_PROGRESS')
        "#,
        params![study_date, start_time, subject, topic],
    )?;
    let id = conn.last_insert_rowid();
    println!("Registro criado, id: {}", id);
    Ok(id)
}