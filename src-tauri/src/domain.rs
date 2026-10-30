use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Modality {
    Reading,   // Leitura
    Media,     // Videoaula / Podcast / Áudio
    Review,    // Revisão
    Questions, // Resolução de Questões
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SessionStatus {
    #[serde(rename = "IN_PROGRESS")]
    InProgress,
    #[serde(rename = "COMPLETED")]
    Completed,
    #[serde(rename = "RECOVERED")]
    Recovered,
}

impl SessionStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            SessionStatus::InProgress => "IN_PROGRESS",
            SessionStatus::Completed => "COMPLETED",
            SessionStatus::Recovered => "RECOVERED",
        }
    }
}

#[derive(Debug, Clone)]
pub enum TrackerState {
    Idle,
    Running {
        active_modality: Modality,
        slice_started_at: Instant,
    },
    Paused {
        last_modality: Modality,
        pause_started_at: Instant,
    },
}

#[derive(Debug, Clone)]
pub struct ActiveSession {
    pub db_id: i64,
    pub study_date: String,
    pub start_time: String,
    pub subject: String,
    pub topic: String,
    pub reading_acc: Duration,
    pub media_acc: Duration,
    pub review_acc: Duration,
    pub questions_acc: Duration,
    pub paused_acc: Duration,
    pub state: TrackerState,
    pub last_checkpoint_at: Instant,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSnapshot {
    pub status: String, // "idle" | "running" | "paused"
    pub active_modality: Option<Modality>,
    pub last_modality: Option<Modality>,
    pub subject: String,
    pub topic: String,
    pub reading_sec: u64,
    pub media_sec: u64,
    pub review_sec: u64,
    pub questions_sec: u64,
    pub paused_sec: u64,
    pub total_active_sec: u64,  // Soma exata das 4 modalidades ativas
    pub total_active_ms: u64,   // Tempo líquido total em milissegundos (para décimos de segundo)
    pub current_slice_sec: u64, // Tempo decorrido na modalidade/pausa atual
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StudySessionRecord {
    pub id: i64,
    pub study_date: String,
    pub start_time: String,
    pub end_time: Option<String>,
    pub subject: String,
    pub topic: String,
    pub time_reading_sec: u64,
    pub time_media_sec: u64,
    pub time_review_sec: u64,
    pub time_questions_sec: u64,
    pub time_paused_sec: u64,
    pub total_active_sec: u64,
    pub status: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DailySummary {
    pub study_date: String,
    pub sessions: Vec<StudySessionRecord>,
    pub total_reading_sec: u64,
    pub total_media_sec: u64,
    pub total_review_sec: u64,
    pub total_questions_sec: u64,
    pub total_paused_sec: u64,
    pub total_active_sec: u64,
    pub subjects: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryData {
    pub sessions: Vec<StudySessionRecord>,
    pub subjects: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InitialData {
    pub subjects: Vec<String>,
    pub daily_summary: DailySummary,
    pub history_sessions: Vec<StudySessionRecord>,
    pub snapshot: SessionSnapshot,
    pub recovered_sessions: Vec<StudySessionRecord>,
}
