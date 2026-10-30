use crate::db;
use crate::domain::{
    ActiveSession, DailySummary, HistoryData, InitialData, Modality, SessionSnapshot,
    StudySessionRecord,
};
use chrono::Local;
use rusqlite::Connection;
use std::sync::Mutex;
use std::time::Instant;
use tauri::{AppHandle, State};

pub struct AppState {
    pub db: Connection,
    pub active_session: Option<ActiveSession>,
    pub recovered_on_startup: Vec<StudySessionRecord>,
}

impl AppState {
    pub fn new(db: Connection, recovered_on_startup: Vec<StudySessionRecord>) -> Self {
        Self {
            db,
            active_session: None,
            recovered_on_startup,
        }
    }

    pub fn has_active_session(&self) -> bool {
        self.active_session
            .as_ref()
            .is_some_and(|session| session.is_active())
    }

    pub fn checkpoint_wal(&self) {
        let _ = db::checkpoint_wal(&self.db);
    }

    pub fn get_session_snapshot_at(&mut self, now: Instant) -> Result<SessionSnapshot, String> {
        let AppState {
            db, active_session, ..
        } = self;

        if let Some(session) = active_session.as_mut() {
            let snapshot = session.snapshot_at(now);
            if session.should_auto_checkpoint_at(now)
                && db::checkpoint_session(
                    db,
                    session.db_id,
                    &session.subject,
                    &session.topic,
                    &snapshot,
                )
                .is_ok()
            {
                session.mark_checkpointed_at(now);
            }
            Ok(snapshot)
        } else {
            Ok(SessionSnapshot::idle())
        }
    }

    pub fn start_or_switch_modality_at(
        &mut self,
        modality: Modality,
        subject: String,
        topic: String,
        now: Instant,
    ) -> Result<SessionSnapshot, String> {
        let clean_subject = subject.trim().to_string();
        let clean_topic = topic.trim().to_string();

        if clean_subject.is_empty() {
            return Err("Informe a matéria para iniciar ou continuar o estudo.".to_string());
        }

        let AppState {
            db, active_session, ..
        } = self;

        match active_session {
            None => {
                let now_local = Local::now();
                let study_date = now_local.format("%Y-%m-%d").to_string();
                let start_time = now_local.to_rfc3339();

                let db_id =
                    db::create_session(db, &study_date, &start_time, &clean_subject, &clean_topic)
                        .map_err(|e| format!("Falha ao registrar sessão no banco de dados: {e}"))?;

                let session = ActiveSession::new_at(
                    db_id,
                    study_date,
                    start_time,
                    clean_subject,
                    clean_topic,
                    modality,
                    now,
                );
                let snapshot = session.snapshot_at(now);
                *active_session = Some(session);
                Ok(snapshot)
            }
            Some(session) => {
                let metadata_changed =
                    session.subject != clean_subject || session.topic != clean_topic;
                session.subject = clean_subject;
                session.topic = clean_topic;

                let transitioned = session.switch_modality_at(modality, now);
                let snapshot = session.snapshot_at(now);

                if transitioned {
                    db::checkpoint_session(
                        db,
                        session.db_id,
                        &session.subject,
                        &session.topic,
                        &snapshot,
                    )
                    .map_err(|e| format!("Falha ao salvar checkpoint de modalidade: {e}"))?;
                } else if metadata_changed {
                    db::update_metadata(db, session.db_id, &session.subject, &session.topic)
                        .map_err(|e| format!("Falha ao atualizar metadados: {e}"))?;
                }

                Ok(snapshot)
            }
        }
    }

    pub fn toggle_pause_at(&mut self, now: Instant) -> Result<SessionSnapshot, String> {
        let AppState {
            db, active_session, ..
        } = self;

        let session = active_session
            .as_mut()
            .ok_or_else(|| "Nenhuma sessão ativa para pausar ou retomar.".to_string())?;

        session.toggle_pause_at(now)?;
        let snapshot = session.snapshot_at(now);

        db::checkpoint_session(
            db,
            session.db_id,
            &session.subject,
            &session.topic,
            &snapshot,
        )
        .map_err(|e| format!("Falha ao salvar estado de pausa: {e}"))?;

        Ok(snapshot)
    }

    pub fn update_session_metadata_at(
        &mut self,
        subject: String,
        topic: String,
        now: Instant,
    ) -> Result<(), String> {
        let clean_subject = subject.trim().to_string();
        let clean_topic = topic.trim().to_string();

        let AppState {
            db, active_session, ..
        } = self;

        if let Some(session) = active_session.as_mut() {
            if clean_subject.is_empty() {
                return Err("O campo Matéria não pode ficar vazio durante o estudo.".to_string());
            }
            session.subject = clean_subject;
            session.topic = clean_topic;
            let snapshot = session.snapshot_at(now);
            db::checkpoint_session(
                db,
                session.db_id,
                &session.subject,
                &session.topic,
                &snapshot,
            )
            .map_err(|e| format!("Falha ao atualizar matéria/conteúdo: {e}"))?;
            session.mark_checkpointed_at(now);
        }

        Ok(())
    }

    pub fn consolidate_and_persist_stop_at(&mut self, now: Instant) -> Result<(), String> {
        let Some(mut session) = self.active_session.take() else {
            return Err("Nenhuma sessão em andamento para finalizar.".to_string());
        };

        let final_snapshot = session.consolidate_and_finish_at(now);
        let end_time = Local::now().to_rfc3339();

        db::finalize_session(
            &self.db,
            session.db_id,
            &end_time,
            &session.subject,
            &session.topic,
            &final_snapshot,
        )
        .map_err(|e| format!("Falha ao finalizar sessão no banco de dados: {e}"))?;

        Ok(())
    }

    pub fn stop_session_at(&mut self, now: Instant) -> Result<DailySummary, String> {
        self.consolidate_and_persist_stop_at(now)?;
        let today = Local::now().format("%Y-%m-%d").to_string();
        db::get_daily_summary(&self.db, &today)
            .map_err(|e| format!("Falha ao consultar resumo diário: {e}"))
    }

    pub fn get_initial_data_at(&self, now: Instant) -> Result<InitialData, String> {
        let today = Local::now().format("%Y-%m-%d").to_string();
        let daily_summary = db::get_daily_summary(&self.db, &today)
            .map_err(|e| format!("Falha ao carregar dados iniciais: {e}"))?;
        let history_sessions = db::get_all_completed_sessions(&self.db)
            .map_err(|e| format!("Falha ao carregar histórico de estudos: {e}"))?;
        let subjects = daily_summary.subjects.clone();
        let snapshot = match &self.active_session {
            Some(session) => session.snapshot_at(now),
            None => SessionSnapshot::idle(),
        };

        Ok(InitialData {
            subjects,
            daily_summary,
            history_sessions,
            snapshot,
            recovered_sessions: self.recovered_on_startup.clone(),
        })
    }

    pub fn get_history_data(&self) -> Result<HistoryData, String> {
        let sessions = db::get_all_completed_sessions(&self.db)
            .map_err(|e| format!("Falha ao consultar histórico de estudos: {e}"))?;
        let subjects = db::get_distinct_subjects(&self.db)
            .map_err(|e| format!("Falha ao consultar matérias cadastradas: {e}"))?;
        Ok(HistoryData { sessions, subjects })
    }

    pub fn update_history_session(
        &mut self,
        id: i64,
        subject: String,
        topic: String,
    ) -> Result<HistoryData, String> {
        let clean_subject = subject.trim().to_string();
        let clean_topic = topic.trim().to_string();

        if clean_subject.is_empty() {
            return Err("Informe a matéria para salvar as alterações.".to_string());
        }

        let updated = db::update_completed_session(&self.db, id, &clean_subject, &clean_topic)
            .map_err(|e| format!("Falha ao atualizar registro de estudo: {e}"))?;

        if !updated {
            return Err("Registro de estudo não encontrado no histórico.".to_string());
        }

        for rec in &mut self.recovered_on_startup {
            if rec.id == id {
                rec.subject = clean_subject.clone();
                rec.topic = clean_topic.clone();
            }
        }

        self.get_history_data()
    }

    pub fn delete_history_session(&mut self, id: i64) -> Result<HistoryData, String> {
        let deleted = db::delete_completed_session(&self.db, id)
            .map_err(|e| format!("Falha ao excluir registro de estudo: {e}"))?;

        if !deleted {
            return Err("Registro de estudo não encontrado para exclusão.".to_string());
        }

        self.recovered_on_startup.retain(|rec| rec.id != id);

        self.get_history_data()
    }
}

fn lock_state<'a>(
    state: &'a State<'_, Mutex<AppState>>,
) -> Result<std::sync::MutexGuard<'a, AppState>, String> {
    state
        .lock()
        .map_err(|_| "Erro interno: falha ao bloquear estado da aplicação.".to_string())
}

#[tauri::command]
pub fn get_session_snapshot(state: State<'_, Mutex<AppState>>) -> Result<SessionSnapshot, String> {
    let mut guard = lock_state(&state)?;
    guard.get_session_snapshot_at(Instant::now())
}

#[tauri::command]
pub fn start_or_switch_modality(
    modality: Modality,
    subject: String,
    topic: String,
    state: State<'_, Mutex<AppState>>,
) -> Result<SessionSnapshot, String> {
    let mut guard = lock_state(&state)?;
    guard.start_or_switch_modality_at(modality, subject, topic, Instant::now())
}

#[tauri::command]
pub fn toggle_pause(state: State<'_, Mutex<AppState>>) -> Result<SessionSnapshot, String> {
    let mut guard = lock_state(&state)?;
    guard.toggle_pause_at(Instant::now())
}

#[tauri::command]
pub fn update_session_metadata(
    subject: String,
    topic: String,
    state: State<'_, Mutex<AppState>>,
) -> Result<(), String> {
    let mut guard = lock_state(&state)?;
    guard.update_session_metadata_at(subject, topic, Instant::now())
}

#[tauri::command]
pub fn stop_session(state: State<'_, Mutex<AppState>>) -> Result<DailySummary, String> {
    let mut guard = lock_state(&state)?;
    guard.stop_session_at(Instant::now())
}

#[tauri::command]
pub fn get_initial_data(state: State<'_, Mutex<AppState>>) -> Result<InitialData, String> {
    let guard = lock_state(&state)?;
    guard.get_initial_data_at(Instant::now())
}

#[tauri::command]
pub fn get_history_data(state: State<'_, Mutex<AppState>>) -> Result<HistoryData, String> {
    let guard = lock_state(&state)?;
    guard.get_history_data()
}

#[tauri::command]
pub fn update_history_session(
    id: i64,
    subject: String,
    topic: String,
    state: State<'_, Mutex<AppState>>,
) -> Result<HistoryData, String> {
    let mut guard = lock_state(&state)?;
    guard.update_history_session(id, subject, topic)
}

#[tauri::command]
pub fn delete_history_session(
    id: i64,
    state: State<'_, Mutex<AppState>>,
) -> Result<HistoryData, String> {
    let mut guard = lock_state(&state)?;
    guard.delete_history_session(id)
}

#[tauri::command]
pub fn confirm_close_and_exit(
    app_handle: AppHandle,
    state: State<'_, Mutex<AppState>>,
) -> Result<(), String> {
    {
        let mut guard = lock_state(&state)?;
        if guard.has_active_session() {
            guard.consolidate_and_persist_stop_at(Instant::now())?;
        }
        guard.checkpoint_wal();
    }
    app_handle.exit(0);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    fn test_app_state() -> AppState {
        let conn = Connection::open_in_memory().unwrap();
        db::init_schema(&conn).unwrap();
        AppState::new(conn, Vec::new())
    }

    #[test]
    fn rejects_empty_or_whitespace_subject_when_starting() {
        let mut state = test_app_state();
        let t0 = Instant::now();
        let err = state
            .start_or_switch_modality_at(
                Modality::Reading,
                "   ".to_string(),
                "Tópico".to_string(),
                t0,
            )
            .unwrap_err();
        assert!(err.contains("matéria"));
        assert!(!state.has_active_session());
    }

    #[test]
    fn full_session_flow_persists_checkpoints_metadata_and_summary() {
        let mut state = test_app_state();
        let t0 = Instant::now();

        // Inicia em Leitura com espaços extras que devem ser higienizados (trim)
        let snap0 = state
            .start_or_switch_modality_at(
                Modality::Reading,
                "  Direito Constitucional  ".to_string(),
                "  Controle Difuso  ".to_string(),
                t0,
            )
            .unwrap();
        assert_eq!(snap0.status, "running");
        assert_eq!(snap0.subject, "Direito Constitucional");
        assert_eq!(snap0.topic, "Controle Difuso");
        assert!(state.has_active_session());

        // 25s em Leitura -> troca para Videoaula
        let t1 = t0 + Duration::from_secs(25);
        let snap1 = state
            .start_or_switch_modality_at(
                Modality::Media,
                "Direito Constitucional".to_string(),
                "Controle Difuso".to_string(),
                t1,
            )
            .unwrap();
        assert_eq!(snap1.reading_sec, 25);
        assert_eq!(snap1.active_modality, Some(Modality::Media));

        // Atualiza metadados dinamicamente (RN02)
        state
            .update_session_metadata_at(
                "Direito Constitucional".to_string(),
                "Controle Concentrado (ADI/ADC)".to_string(),
                t1 + Duration::from_secs(5),
            )
            .unwrap();

        // Tentar limpar matéria durante sessão ativa deve falhar sem corromper o estado
        assert!(
            state
                .update_session_metadata_at(
                    "  ".to_string(),
                    "Teste".to_string(),
                    t1 + Duration::from_secs(6)
                )
                .is_err()
        );

        // 35s em Videoaula -> Pausa
        let t2 = t1 + Duration::from_secs(35);
        let snap_paused = state.toggle_pause_at(t2).unwrap();
        assert_eq!(snap_paused.status, "paused");
        assert_eq!(snap_paused.media_sec, 35);

        // 10s em Pausa -> clica direto em Questões (RN03)
        let t3 = t2 + Duration::from_secs(10);
        state
            .start_or_switch_modality_at(
                Modality::Questions,
                "Direito Constitucional".to_string(),
                "Controle Concentrado (ADI/ADC)".to_string(),
                t3,
            )
            .unwrap();

        // 40s em Questões -> Finaliza estudo
        let t4 = t3 + Duration::from_secs(40);
        let summary = state.stop_session_at(t4).unwrap();

        assert!(!state.has_active_session());
        assert_eq!(summary.sessions.len(), 1);
        let recorded = &summary.sessions[0];
        assert_eq!(recorded.subject, "Direito Constitucional");
        assert_eq!(recorded.topic, "Controle Concentrado (ADI/ADC)");
        assert_eq!(recorded.time_reading_sec, 25);
        assert_eq!(recorded.time_media_sec, 35);
        assert_eq!(recorded.time_review_sec, 0);
        assert_eq!(recorded.time_questions_sec, 40);
        assert_eq!(recorded.time_paused_sec, 10);
        assert_eq!(recorded.total_active_sec, 100);
        assert_eq!(recorded.status, "COMPLETED");
        assert!(recorded.end_time.is_some());
        assert_eq!(summary.total_active_sec, 100);
        assert_eq!(summary.subjects, vec!["Direito Constitucional".to_string()]);

        // Estado voltou para Idle
        let idle_snap = state.get_session_snapshot_at(t4).unwrap();
        assert_eq!(idle_snap.status, "idle");
    }

    #[test]
    fn idle_stop_and_pause_return_errors_and_metadata_is_safe_noop() {
        let mut state = test_app_state();
        let now = Instant::now();
        assert!(state.toggle_pause_at(now).is_err());
        assert!(state.stop_session_at(now).is_err());
        assert!(
            state
                .update_session_metadata_at("Matéria".to_string(), "Tópico".to_string(), now)
                .is_ok()
        );
    }

    #[test]
    fn duplicate_start_same_modality_does_not_create_duplicate_rows_and_auto_checkpoints() {
        let mut state = test_app_state();
        let t0 = Instant::now();

        state
            .start_or_switch_modality_at(
                Modality::Reading,
                "Informática".to_string(),
                "Redes".to_string(),
                t0,
            )
            .unwrap();

        // Duplo clique rápido na mesma modalidade
        state
            .start_or_switch_modality_at(
                Modality::Reading,
                "Informática".to_string(),
                "Redes".to_string(),
                t0 + Duration::from_millis(30),
            )
            .unwrap();

        // Após 15s de polling sem trocar modalidade, auto-checkpoint grava no SQLite
        let snap = state
            .get_session_snapshot_at(t0 + Duration::from_secs(15))
            .unwrap();
        assert_eq!(snap.reading_sec, 15);

        // Simula queda abrupta e recuperação na próxima abertura
        let recovered = db::recover_dangling_sessions(&state.db).unwrap();
        assert_eq!(recovered.len(), 1);
        assert_eq!(recovered[0].subject, "Informática");
        assert_eq!(recovered[0].total_active_sec, 15);
    }

    #[test]
    fn get_initial_data_is_idempotent_under_strict_mode_double_invoke() {
        let conn = Connection::open_in_memory().unwrap();
        db::init_schema(&conn).unwrap();
        let id = db::create_session(
            &conn,
            "2026-10-29",
            "2026-10-29T08:00:00-03:00",
            "Português",
            "Sintaxe",
        )
        .unwrap();
        let mut snap = SessionSnapshot::idle();
        snap.reading_sec = 600;
        snap.total_active_sec = 600;
        db::checkpoint_session(&conn, id, "Português", "Sintaxe", &snap).unwrap();

        let recovered = db::recover_dangling_sessions(&conn).unwrap();
        let state = AppState::new(conn, recovered);

        let now = Instant::now();
        let init1 = state.get_initial_data_at(now).unwrap();
        let init2 = state.get_initial_data_at(now).unwrap();
        assert_eq!(init1.recovered_sessions.len(), 1);
        assert_eq!(init2.recovered_sessions.len(), 1);
        assert_eq!(init1.history_sessions.len(), 1);
    }

    #[test]
    fn history_edit_and_delete_validate_inputs_update_subjects_and_preserve_active_session() {
        let mut state = test_app_state();
        let t0 = Instant::now();

        state
            .start_or_switch_modality_at(
                Modality::Reading,
                "RLM".to_string(),
                "Proposições".to_string(),
                t0,
            )
            .unwrap();
        let summary = state.stop_session_at(t0 + Duration::from_secs(30)).unwrap();
        let session_id = summary.sessions[0].id;

        // Inicia nova sessão ativa em paralelo
        let t1 = t0 + Duration::from_secs(40);
        state
            .start_or_switch_modality_at(
                Modality::Questions,
                "Informática".to_string(),
                "Segurança".to_string(),
                t1,
            )
            .unwrap();
        let active_db_id = state.active_session.as_ref().unwrap().db_id;

        // Valida rejeição de matéria vazia ao editar histórico
        assert!(
            state
                .update_history_session(session_id, "   ".to_string(), "Qualquer".to_string())
                .is_err()
        );

        // Protege a sessão ativa (IN_PROGRESS) contra edição/exclusão via histórico
        assert!(
            state
                .update_history_session(active_db_id, "Outra".to_string(), "Outro".to_string())
                .is_err()
        );
        assert!(state.delete_history_session(active_db_id).is_err());

        // Edita sessão concluída (com trim e tópico opcional vazio)
        let edited = state
            .update_history_session(
                session_id,
                "  Raciocínio Lógico  ".to_string(),
                "   ".to_string(),
            )
            .unwrap();
        assert_eq!(edited.sessions.len(), 1);
        assert_eq!(edited.sessions[0].subject, "Raciocínio Lógico");
        assert_eq!(edited.sessions[0].topic, "");
        assert_eq!(
            edited.subjects,
            vec!["Informática".to_string(), "Raciocínio Lógico".to_string()]
        );

        // Exclui sessão concluída e verifica que a sessão ativa continua intacta
        let after_del = state.delete_history_session(session_id).unwrap();
        assert!(after_del.sessions.is_empty());
        assert_eq!(after_del.subjects, vec!["Informática".to_string()]);
        assert!(state.has_active_session());

        // Excluir novamente o mesmo ID deve retornar erro
        assert!(state.delete_history_session(session_id).is_err());
    }
}
