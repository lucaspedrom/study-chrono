use crate::domain::{ActiveSession, Modality, SessionSnapshot, TrackerState};
use std::time::{Duration, Instant};

const AUTO_CHECKPOINT_INTERVAL: Duration = Duration::from_secs(10);

impl SessionSnapshot {
    pub fn idle() -> Self {
        Self {
            status: "idle".to_string(),
            active_modality: None,
            last_modality: None,
            subject: String::new(),
            topic: String::new(),
            reading_sec: 0,
            media_sec: 0,
            review_sec: 0,
            questions_sec: 0,
            paused_sec: 0,
            total_active_sec: 0,
            total_active_ms: 0,
            current_slice_sec: 0,
        }
    }
}

impl ActiveSession {
    pub fn new(
        db_id: i64,
        study_date: String,
        start_time: String,
        subject: String,
        topic: String,
        modality: Modality,
    ) -> Self {
        Self::new_at(
            db_id,
            study_date,
            start_time,
            subject,
            topic,
            modality,
            Instant::now(),
        )
    }

    pub fn new_at(
        db_id: i64,
        study_date: String,
        start_time: String,
        subject: String,
        topic: String,
        modality: Modality,
        now: Instant,
    ) -> Self {
        Self {
            db_id,
            study_date,
            start_time,
            subject,
            topic,
            reading_acc: Duration::ZERO,
            media_acc: Duration::ZERO,
            review_acc: Duration::ZERO,
            questions_acc: Duration::ZERO,
            paused_acc: Duration::ZERO,
            state: TrackerState::Running {
                active_modality: modality,
                slice_started_at: now,
            },
            last_checkpoint_at: now,
        }
    }

    pub fn is_active(&self) -> bool {
        !matches!(self.state, TrackerState::Idle)
    }

    pub fn should_auto_checkpoint_at(&self, now: Instant) -> bool {
        self.is_active()
            && now.saturating_duration_since(self.last_checkpoint_at) >= AUTO_CHECKPOINT_INTERVAL
    }

    pub fn mark_checkpointed_at(&mut self, now: Instant) {
        self.last_checkpoint_at = now;
    }

    fn add_modality_duration(&mut self, modality: Modality, delta: Duration) {
        match modality {
            Modality::Reading => self.reading_acc += delta,
            Modality::Media => self.media_acc += delta,
            Modality::Review => self.review_acc += delta,
            Modality::Questions => self.questions_acc += delta,
        }
    }

    pub fn snapshot(&self) -> SessionSnapshot {
        self.snapshot_at(Instant::now())
    }

    /// Calcula o snapshot em tempo real sem mutar `slice_started_at` nem os acumuladores.
    pub fn snapshot_at(&self, now: Instant) -> SessionSnapshot {
        let mut reading = self.reading_acc;
        let mut media = self.media_acc;
        let mut review = self.review_acc;
        let mut questions = self.questions_acc;
        let mut paused = self.paused_acc;

        let (status, active_modality, last_modality, current_slice_sec) = match self.state {
            TrackerState::Idle => ("idle".to_string(), None, None, 0),
            TrackerState::Running {
                active_modality,
                slice_started_at,
            } => {
                let delta = now.saturating_duration_since(slice_started_at);
                match active_modality {
                    Modality::Reading => reading += delta,
                    Modality::Media => media += delta,
                    Modality::Review => review += delta,
                    Modality::Questions => questions += delta,
                }
                (
                    "running".to_string(),
                    Some(active_modality),
                    Some(active_modality),
                    delta.as_secs(),
                )
            }
            TrackerState::Paused {
                last_modality,
                pause_started_at,
            } => {
                let delta = now.saturating_duration_since(pause_started_at);
                paused += delta;
                (
                    "paused".to_string(),
                    None,
                    Some(last_modality),
                    delta.as_secs(),
                )
            }
        };

        let reading_sec = reading.as_secs();
        let media_sec = media.as_secs();
        let review_sec = review.as_secs();
        let questions_sec = questions.as_secs();
        let paused_sec = paused.as_secs();
        let total_active_sec = reading_sec + media_sec + review_sec + questions_sec;
        let total_active_duration = reading + media + review + questions;
        let total_active_ms = total_active_duration.as_millis().min(u64::MAX as u128) as u64;

        SessionSnapshot {
            status,
            active_modality,
            last_modality,
            subject: self.subject.clone(),
            topic: self.topic.clone(),
            reading_sec,
            media_sec,
            review_sec,
            questions_sec,
            paused_sec,
            total_active_sec,
            total_active_ms,
            current_slice_sec,
        }
    }

    pub fn switch_modality(&mut self, modality: Modality) -> bool {
        self.switch_modality_at(modality, Instant::now())
    }

    /// Alterna para a modalidade informada (ou retoma a partir de Paused).
    /// Retorna `false` caso a modalidade já esteja ativa em `Running` (RN03: no-op).
    pub fn switch_modality_at(&mut self, modality: Modality, now: Instant) -> bool {
        match self.state {
            TrackerState::Running {
                active_modality,
                slice_started_at,
            } => {
                if active_modality == modality {
                    return false;
                }
                let delta = now.saturating_duration_since(slice_started_at);
                self.add_modality_duration(active_modality, delta);
                self.state = TrackerState::Running {
                    active_modality: modality,
                    slice_started_at: now,
                };
                self.last_checkpoint_at = now;
                true
            }
            TrackerState::Paused {
                pause_started_at, ..
            } => {
                let delta = now.saturating_duration_since(pause_started_at);
                self.paused_acc += delta;
                self.state = TrackerState::Running {
                    active_modality: modality,
                    slice_started_at: now,
                };
                self.last_checkpoint_at = now;
                true
            }
            TrackerState::Idle => {
                self.state = TrackerState::Running {
                    active_modality: modality,
                    slice_started_at: now,
                };
                self.last_checkpoint_at = now;
                true
            }
        }
    }

    pub fn toggle_pause(&mut self) -> Result<(), String> {
        self.toggle_pause_at(Instant::now())
    }

    pub fn toggle_pause_at(&mut self, now: Instant) -> Result<(), String> {
        match self.state {
            TrackerState::Running {
                active_modality,
                slice_started_at,
            } => {
                let delta = now.saturating_duration_since(slice_started_at);
                self.add_modality_duration(active_modality, delta);
                self.state = TrackerState::Paused {
                    last_modality: active_modality,
                    pause_started_at: now,
                };
                self.last_checkpoint_at = now;
                Ok(())
            }
            TrackerState::Paused {
                last_modality,
                pause_started_at,
            } => {
                let delta = now.saturating_duration_since(pause_started_at);
                self.paused_acc += delta;
                self.state = TrackerState::Running {
                    active_modality: last_modality,
                    slice_started_at: now,
                };
                self.last_checkpoint_at = now;
                Ok(())
            }
            TrackerState::Idle => Err("Nenhuma sessão em andamento para pausar.".to_string()),
        }
    }

    pub fn consolidate_and_finish(&mut self) -> SessionSnapshot {
        self.consolidate_and_finish_at(Instant::now())
    }

    /// Consolida a fatia final (ativa ou pausada), transiciona para `Idle` e retorna os totais finais.
    pub fn consolidate_and_finish_at(&mut self, now: Instant) -> SessionSnapshot {
        match self.state {
            TrackerState::Running {
                active_modality,
                slice_started_at,
            } => {
                let delta = now.saturating_duration_since(slice_started_at);
                self.add_modality_duration(active_modality, delta);
            }
            TrackerState::Paused {
                pause_started_at, ..
            } => {
                let delta = now.saturating_duration_since(pause_started_at);
                self.paused_acc += delta;
            }
            TrackerState::Idle => {}
        }
        self.state = TrackerState::Idle;
        self.last_checkpoint_at = now;
        self.snapshot_at(now)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_session(t0: Instant, modality: Modality) -> ActiveSession {
        ActiveSession::new_at(
            1,
            "2026-10-29".to_string(),
            "2026-10-29T09:00:00-03:00".to_string(),
            "Direito Constitucional".to_string(),
            "Controle de Constitucionalidade".to_string(),
            modality,
            t0,
        )
    }

    #[test]
    fn idle_snapshot_has_zeroed_counters() {
        let snap = SessionSnapshot::idle();
        assert_eq!(snap.status, "idle");
        assert_eq!(snap.active_modality, None);
        assert_eq!(snap.total_active_sec, 0);
        assert_eq!(snap.paused_sec, 0);
        assert_eq!(snap.current_slice_sec, 0);
    }

    #[test]
    fn preserves_subsecond_precision_across_rapid_modality_switches() {
        let t0 = Instant::now();
        let mut session = sample_session(t0, Modality::Reading);

        // 2.8s em Leitura -> troca para Questões
        let t1 = t0 + Duration::from_millis(2800);
        assert!(session.switch_modality_at(Modality::Questions, t1));

        // 1.7s em Questões -> volta para Leitura
        let t2 = t1 + Duration::from_millis(1700);
        assert!(session.switch_modality_at(Modality::Reading, t2));

        // Mais 2.4s em Leitura (total Leitura = 2.8 + 2.4 = 5.2s -> 5s, não 4s!)
        let t3 = t2 + Duration::from_millis(2400);
        assert!(session.switch_modality_at(Modality::Questions, t3));

        // Mais 1.5s em Questões (total Questões = 1.7 + 1.5 = 3.2s -> 3s, não 2s!)
        let t4 = t3 + Duration::from_millis(1500);
        let final_snap = session.consolidate_and_finish_at(t4);

        assert_eq!(final_snap.status, "idle");
        assert_eq!(final_snap.reading_sec, 5);
        assert_eq!(final_snap.questions_sec, 3);
        assert_eq!(final_snap.media_sec, 0);
        assert_eq!(final_snap.review_sec, 0);
        assert_eq!(final_snap.total_active_sec, 8);
    }

    #[test]
    fn clicking_same_active_modality_is_noop() {
        let t0 = Instant::now();
        let mut session = sample_session(t0, Modality::Media);

        let t1 = t0 + Duration::from_secs(12);
        let changed = session.switch_modality_at(Modality::Media, t1);
        assert!(!changed);

        let t2 = t0 + Duration::from_secs(20);
        let snap = session.snapshot_at(t2);
        assert_eq!(snap.status, "running");
        assert_eq!(snap.active_modality, Some(Modality::Media));
        // Como não resetou a fatia em t1, current_slice_sec permanece 20s contínuos
        assert_eq!(snap.current_slice_sec, 20);
        assert_eq!(snap.media_sec, 20);
    }

    #[test]
    fn pause_and_resume_restores_last_modality_and_accumulates_paused_time() {
        let t0 = Instant::now();
        let mut session = sample_session(t0, Modality::Review);

        // Estuda 30s em Revisão e pausa
        let t1 = t0 + Duration::from_secs(30);
        session.toggle_pause_at(t1).unwrap();

        let t_mid_pause = t1 + Duration::from_secs(15);
        let paused_snap = session.snapshot_at(t_mid_pause);
        assert_eq!(paused_snap.status, "paused");
        assert_eq!(paused_snap.active_modality, None);
        assert_eq!(paused_snap.last_modality, Some(Modality::Review));
        assert_eq!(paused_snap.review_sec, 30);
        assert_eq!(paused_snap.paused_sec, 15);
        assert_eq!(paused_snap.current_slice_sec, 15);
        assert_eq!(paused_snap.total_active_sec, 30);

        // Retoma após 25s totais de pausa
        let t2 = t1 + Duration::from_secs(25);
        session.toggle_pause_at(t2).unwrap();

        // Estuda mais 10s em Revisão
        let t3 = t2 + Duration::from_secs(10);
        let resumed_snap = session.snapshot_at(t3);
        assert_eq!(resumed_snap.status, "running");
        assert_eq!(resumed_snap.active_modality, Some(Modality::Review));
        assert_eq!(resumed_snap.review_sec, 40);
        assert_eq!(resumed_snap.paused_sec, 25);
        assert_eq!(resumed_snap.current_slice_sec, 10);
        assert_eq!(resumed_snap.total_active_sec, 40);
    }

    #[test]
    fn clicking_modality_while_paused_ends_pause_and_switches_directly() {
        let t0 = Instant::now();
        let mut session = sample_session(t0, Modality::Reading);

        let t1 = t0 + Duration::from_secs(45);
        session.toggle_pause_at(t1).unwrap();

        // Após 12s pausado, clica diretamente em Questões (RN03)
        let t2 = t1 + Duration::from_secs(12);
        assert!(session.switch_modality_at(Modality::Questions, t2));

        let t3 = t2 + Duration::from_secs(18);
        let snap = session.consolidate_and_finish_at(t3);
        assert_eq!(snap.reading_sec, 45);
        assert_eq!(snap.paused_sec, 12);
        assert_eq!(snap.questions_sec, 18);
        assert_eq!(snap.total_active_sec, 63);
    }

    #[test]
    fn finishing_while_paused_consolidates_final_pause_slice() {
        let t0 = Instant::now();
        let mut session = sample_session(t0, Modality::Media);

        let t1 = t0 + Duration::from_secs(50);
        session.toggle_pause_at(t1).unwrap();

        let t2 = t1 + Duration::from_secs(9);
        let snap = session.consolidate_and_finish_at(t2);
        assert_eq!(snap.status, "idle");
        assert_eq!(snap.media_sec, 50);
        assert_eq!(snap.paused_sec, 9);
        assert_eq!(snap.total_active_sec, 50);
        assert!(!session.is_active());
        assert!(session.toggle_pause_at(t2).is_err());
    }

    #[test]
    fn snapshot_polling_does_not_mutate_accumulators() {
        let t0 = Instant::now();
        let session = sample_session(t0, Modality::Reading);

        for ms in [200_u64, 400, 600, 800, 1000, 1250] {
            let _ = session.snapshot_at(t0 + Duration::from_millis(ms));
        }

        assert_eq!(session.reading_acc, Duration::ZERO);
        let snap = session.snapshot_at(t0 + Duration::from_millis(3999));
        assert_eq!(snap.reading_sec, 3);
    }

    #[test]
    fn auto_checkpoint_threshold_triggers_after_interval() {
        let t0 = Instant::now();
        let mut session = sample_session(t0, Modality::Reading);
        assert!(!session.should_auto_checkpoint_at(t0 + Duration::from_secs(9)));
        assert!(session.should_auto_checkpoint_at(t0 + Duration::from_secs(10)));

        session.mark_checkpointed_at(t0 + Duration::from_secs(10));
        assert!(!session.should_auto_checkpoint_at(t0 + Duration::from_secs(19)));
        assert!(session.should_auto_checkpoint_at(t0 + Duration::from_secs(20)));
    }

    #[test]
    fn total_active_ms_is_monotonic_across_subsecond_switches_and_freezes_on_pause() {
        let t0 = Instant::now();
        let mut session = sample_session(t0, Modality::Reading);

        assert_eq!(session.snapshot_at(t0).total_active_ms, 0);
        assert_eq!(
            session
                .snapshot_at(t0 + Duration::from_millis(450))
                .total_active_ms,
            450
        );

        // Troca em 2.8s para Questões
        let t1 = t0 + Duration::from_millis(2800);
        assert!(session.switch_modality_at(Modality::Questions, t1));
        assert_eq!(session.snapshot_at(t1).total_active_ms, 2800);

        // 0.3s depois (total real = 3.1s): total_active_ms nunca regride
        let t2 = t1 + Duration::from_millis(300);
        let snap_running = session.snapshot_at(t2);
        assert_eq!(snap_running.total_active_ms, 3100);

        // Pausa em 3.1s -> durante 5s de pausa, total_active_ms permanece congelado em 3100ms
        session.toggle_pause_at(t2).unwrap();
        let snap_paused = session.snapshot_at(t2 + Duration::from_secs(5));
        assert_eq!(snap_paused.total_active_ms, 3100);
        assert_eq!(snap_paused.paused_sec, 5);
    }
}
