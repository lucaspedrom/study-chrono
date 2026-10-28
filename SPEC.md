# Especificação Técnica: StudyChrono (Tauri v2 + Rust + React/TS)

## 1. Visão Geral e Princípios Arquiteturais

O **StudyChrono** é uma aplicação desktop local voltada para o rastreamento de horas líquidas e brutas de estudo, categorizadas por Matéria, Conteúdo e quatro modalidades de absorção de conhecimento: **Leitura**, **Videoaula/Podcast/Áudio**, **Revisão** e **Resolução de Questões**, além do controle de **Intervalos (Pausas)**.

### Padrão Arquitetural: *Thick Rust Core + Dumb Reactive UI*

Para garantir precisão temporal absoluta e explorar os recursos nativos do Rust:

1. **Rust (Backend Core):** É a única fonte da verdade (*Single Source of Truth*). Gerencia a máquina de estados, calcula os deltas de tempo usando relógio monotônico (`std::time::Instant`), persiste dados transacionais no SQLite e intercepta sinais de fechamento da janela do sistema operacional.
2. **React + TypeScript (Frontend UI):** Atua exclusivamente como camada de apresentação e disparo de intenções do usuário. **Não** executa cálculos de acumulação de tempo via `setInterval` para fins de registro; apenas renderiza o estado calculado pelo Rust.

---

## 2. Stack Tecnológica e Dependências

| Camada | Tecnologia / Biblioteca | Papel no Sistema |
| --- | --- | --- |
| **Framework Desktop** | **Tauri v2** | Ponte IPC, gerenciamento de janela nativa e empacotamento em binário único. |
| **Linguagem Backend** | **Rust (Edition 2021)** | Lógica de domínio, máquina de estados e segurança de memória. |
| **Banco de Dados** | **SQLite (`rusqlite` c/ feature `bundled`)** | Persistência local em arquivo único (`study_chrono.db`), sem depender de SQLite pré-instalado no SO. |
| **Serialização & Datas** | **`serde`, `serde_json`, `chrono**` | Troca de dados tipados entre Rust e TS e geração de timestamps ISO-8601 locais. |
| **Linguagem Frontend** | **TypeScript + React 18+ (Vite)** | Componentização visual com tipagem estática estrita. |
| **Estilização & Ícones** | **Tailwind CSS + `lucide-react**` | Interface escura (*Dark Mode* nativo para foco), limpa e responsiva. |

---

## 3. Estrutura de Diretórios do Projeto

```text
study-chrono/
├── src/                          # Frontend (React + TypeScript)
│   ├── components/
│   │   ├── SubjectInput.tsx      # Input de Matéria (c/ Autocomplete) e Conteúdo
│   │   ├── TimerDisplay.tsx      # Visor principal (Tempo Líquido Total + Modalidade Atual)
│   │   ├── ModalityGrid.tsx      # 4 botões de modalidade com contadores individuais
│   │   ├── ControlBar.tsx        # Botões de Pausar/Retomar e Parar (Finalizar)
│   │   ├── DailyHistory.tsx      # Tabela compacta com sessões registradas hoje + Totais
│   │   └── CloseConfirmModal.tsx # Modal de bloqueio ao tentar fechar com sessão ativa
│   ├── types/
│   │   └── session.ts            # Interfaces TypeScript espelhadas das Structs Rust
│   ├── services/
│   │   └── tauriApi.ts           # Wrappers tipados para invoke() e listen() do Tauri
│   ├── App.tsx                   # Orquestração da tela principal e listeners de eventos
│   └── main.tsx
├── src-tauri/                    # Backend (Rust)
│   ├── src/
│   │   ├── main.rs               # Ponto de entrada
│   │   ├── lib.rs                # Configuração do Tauri, registro de Commands e Window Events
│   │   ├── domain.rs             # Enums (Modality, SessionStatus) e Structs da Máquina de Estados
│   │   ├── timer.rs              # Lógica de cálculo de tempo com Instant e Duration
│   │   ├── db.rs                 # Inicialização do SQLite e queries CRUD
│   │   └── commands.rs           # Funções #[tauri::command] expostas ao Frontend
│   ├── Cargo.toml                # Dependências do Rust
│   └── tauri.conf.json           # Configurações de janela e permissões do Tauri
└── SPEC.md                       # Documento de especificação do sistema

```

---

## 4. Modelagem do Banco de Dados (SQLite)

O arquivo `study_chrono.db` deve ser criado automaticamente no diretório de dados da aplicação (`app_data_dir` do Tauri) durante a inicialização do Rust (`setup` hook).

### DDL: Tabela `study_sessions`

```sql
CREATE TABLE IF NOT EXISTS study_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    study_date TEXT NOT NULL,            -- Formato YYYY-MM-DD (Data local do início)
    start_time TEXT NOT NULL,            -- ISO-8601 (Ex: 2026-10-28T17:00:00-03:00)
    end_time TEXT,                       -- ISO-8601 (Preenchido ao finalizar)
    subject TEXT NOT NULL,               -- Nome da Matéria (higienizado com trim)
    topic TEXT NOT NULL DEFAULT '',      -- Conteúdo / Tópico estudado
    time_reading_sec INTEGER NOT NULL DEFAULT 0,   -- Segundos em Leitura
    time_media_sec INTEGER NOT NULL DEFAULT 0,     -- Segundos em Videoaula/Podcast/Áudio
    time_review_sec INTEGER NOT NULL DEFAULT 0,    -- Segundos em Revisão
    time_questions_sec INTEGER NOT NULL DEFAULT 0, -- Segundos em Resolução de Questões
    time_paused_sec INTEGER NOT NULL DEFAULT 0,    -- Segundos em Pausas/Intervalos
    total_active_sec INTEGER NOT NULL DEFAULT 0,   -- Soma exata das 4 modalidades ativas
    status TEXT NOT NULL DEFAULT 'IN_PROGRESS'     -- 'IN_PROGRESS' | 'COMPLETED' | 'RECOVERED'
);

CREATE INDEX IF NOT EXISTS idx_study_sessions_date ON study_sessions(study_date);
CREATE INDEX IF NOT EXISTS idx_study_sessions_subject ON study_sessions(subject);

```

### Queries Essenciais (`db.rs`)

1. **Autocomplete de Matérias:** `SELECT DISTINCT subject FROM study_sessions WHERE subject != '' ORDER BY subject ASC;`
2. **Histórico do Dia:** `SELECT * FROM study_sessions WHERE study_date = ?1 AND status != 'IN_PROGRESS' ORDER BY start_time DESC;`
3. **Checkpoint de Sessão Ativa:** Atualiza os tempos acumulados e `subject`/`topic` no registro `IN_PROGRESS` a cada troca de modalidade ou pausa.

---

## 5. Especificação do Domínio e Máquina de Estados (Rust)

### Prevenção de Perda de Frações de Segundo (*Sub-second Precision*)

Se o usuário alternar entre modalidades rapidamente (ex: aos `2.8` segundos), truncar para segundos inteiros a cada troca causaria perda de tempo real.

* **Regra de Implementação:** Em memória (`timer.rs`), todo o tempo acumulado deve ser armazenado em `std::time::Duration` (precisão de nanossegundos/milissegundos). A conversão para segundos inteiros (`as_secs()`) ocorre apenas na serialização para exibição e na gravação para o SQLite.

### Estruturas de Domínio (`domain.rs`)

```rust
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
}

```

### DTO de Snapshot para o Frontend (`SessionSnapshot`)

Como `std::time::Instant` não é serializável para JSON, o Rust expõe uma `struct` limpa que já entrega os segundos calculados em tempo real no momento da consulta:

```rust
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSnapshot {
    pub status: String,                  // "idle" | "running" | "paused"
    pub active_modality: Option<Modality>,
    pub subject: String,
    pub topic: String,
    pub reading_sec: u64,
    pub media_sec: u64,
    pub review_sec: u64,
    pub questions_sec: u64,
    pub paused_sec: u64,
    pub total_active_sec: u64,           // Soma das 4 modalidades
    pub current_slice_sec: u64,          // Tempo decorrido na modalidade/pausa atual
}

```

---

## 6. Contrato de Comunicação IPC (Commands & Events)

Para manter o código Rust didático (evitando lidar com *threads* assíncronas complexas logo no início), o gerenciamento de estado usará `tauri::State<'_, Mutex<AppState>>`, e o Frontend fará *polling* leve de `get_session_snapshot` a cada `200ms` apenas quando o status for diferente de `idle`.

### Comandos Tauri (`commands.rs`)

| Comando (`#[tauri::command]`) | Parâmetros | Retorno | Comportamento no Rust |
| --- | --- | --- | --- |
| `get_session_snapshot` | Nenhum | `Result<SessionSnapshot, String>` | Calcula `Instant::now() - slice_started_at`, soma ao acumulador da modalidade ativa em memória (sem mutar a fatia) e retorna o snapshot atualizado. |
| `start_or_switch_modality` | `modality: Modality`, `subject: String`, `topic: String` | `Result<SessionSnapshot, String>` | **Se `Idle`:** Valida se `subject` não está vazio, cria linha `IN_PROGRESS` no SQLite e inicia `Running`. **Se `Running`:** Consolida o delta na modalidade anterior, faz checkpoint no SQLite e inicia nova fatia na nova `modality`. **Se `Paused`:** Consolida delta em `paused_acc` e retoma na `modality` clicada. |
| `toggle_pause` | Nenhum | `Result<SessionSnapshot, String>` | **Se `Running`:** Consolida delta da modalidade ativa, faz checkpoint no SQLite e muda estado para `Paused`. **Se `Paused`:** Consolida delta de pausa e retoma em `Running` usando `last_modality`. |
| `update_session_metadata` | `subject: String`, `topic: String` | `Result<(), String>` | Atualiza `subject` e `topic` na sessão em memória e executa `UPDATE` imediato na linha `IN_PROGRESS` do SQLite. |
| `stop_session` | Nenhum | `Result< DailySummary, String>` | Consolida a última fatia de tempo (ativa ou pausada), preenche `end_time`, atualiza `status = 'COMPLETED'` no SQLite, reseta memória para `Idle` e retorna o histórico do dia atualizado. |
| `get_initial_data` | Nenhum | `Result<InitialData, String>` | Retorna lista de matérias distintas (para o autocomplete), o histórico de sessões do dia atual e eventual sessão recuperada. |
| `confirm_close_and_exit` | `app_handle: AppHandle` | `Result<(), String>` | Executa a mesma rotina de consolidação do `stop_session` e chama `app_handle.exit(0)` para encerrar o processo com segurança. |

---

## 7. Regras de Negócio e Fluxos Críticos

### RN01 — Início Rápido pela Modalidade

* O usuário não precisa clicar em um botão "Iniciar" genérico e depois escolher a modalidade.
* Com a sessão em `Idle`, basta preencher a **Matéria** (obrigatória; se estiver vazia, exibir feedback visual na caixa de texto) e clicar diretamente em qualquer um dos 4 botões (**Leitura**, **Videoaula/Áudio**, **Revisão** ou **Questões**) para disparar o cronômetro geral e o da modalidade escolhida simultaneamente.

### RN02 — Edição Dinâmica Durante o Estudo

* Os campos **Matéria** e **Conteúdo** permanecem habilitados durante toda a sessão (`Running` ou `Paused`).
* Ao editar qualquer um dos dois campos (evento `onBlur` ou *debounce* de `500ms`), o frontend invoca `update_session_metadata(subject, topic)` para garantir que o banco já reflita o texto corrigido.

### RN03 — Troca Quente de Modalidade (*Hot-Swap*)

* Clicar no botão da modalidade que **já está ativa** não faz nada (botão permanece destacado como ativo).
* Clicar em outra modalidade enquanto o cronômetro roda transfere a contagem instantaneamente para a nova modalidade, sem pausar o tempo líquido total.
* Se o cronômetro estiver **Pausado**, clicar diretamente em qualquer uma das 4 modalidades encerra a pausa automaticamente e já retoma o estudo contabilizando naquela modalidade escolhida.

### RN04 — Interceptação de Fechamento da Janela (Proteção contra Perda)

No arquivo `lib.rs`, o evento nativo da janela deve ser interceptado:

1. O usuário clica no **"X"** da janela (ou pressiona `Alt+F4`).
2. O hook `on_window_event` captura `WindowEvent::CloseRequested { api, .. }`.
3. O Rust verifica o `Mutex<AppState>`:
* Se `TrackerState::Idle`: Não faz nada; a janela fecha imediatamente.
* Se `Running` ou `Paused`: Chama `api.prevent_close()` e emite o evento `window.emit("close-requested", ())` para o React.


4. O React escuta `"close-requested"` e exibe o modal `CloseConfirmModal`:
* *"Você possui uma sessão de estudo em andamento. Deseja encerrar e registrar o tempo estudado até agora antes de sair?"*
* **Botão "Continuar Estudando":** Apenas fecha o modal; o cronômetro nunca parou de rodar nos bastidores.
* **Botão "Encerrar, Salvar e Sair":** Invoca o comando `confirm_close_and_exit`, que finaliza a sessão no SQLite e fecha o aplicativo.



### RN05 — Auto-Recuperação de Queda de Energia (*Crash Recovery*)

* Como toda troca de modalidade ou pausa atualiza a linha `IN_PROGRESS` no SQLite, se o computador desligar abruptamente, na próxima abertura do programa a função de inicialização do banco verificará se existe algum registro com `status = 'IN_PROGRESS'`.
* Caso exista e `total_active_sec > 0`, o Rust altera automaticamente seu status para `'RECOVERED'`, define `end_time` com o último checkpoint conhecido e o inclui no histórico, evitando perda de horas estudadas.

---

## 8. Especificação de Interface (Wireframe & Layout em Tailwind)

A janela deve ter dimensões iniciais sugeridas de **`900x720`** (mínimo `760x640`), com tema escuro (`bg-slate-950 text-slate-100`) para conforto visual durante longas horas de estudo.

```text
+-----------------------------------------------------------------------+
|  StudyChrono                                              [_] [□] [X] |
+-----------------------------------------------------------------------+
|  MATÉRIA (Autocomplete)          CONTEÚDO / TÓPICO                    |
|  [ Direito Constitucional   v ]  [ Controle de Constitucionalidade  ] |
+-----------------------------------------------------------------------+
|                                                                       |
|                       TEMPO LÍQUIDO DE ESTUDO                         |
|                           01 : 42 : 18                                |
|                Status: EM ANDAMENTO (Modalidade: Leitura)             |
|                Tempo em Intervalos/Pausas: 00:12:05                   |
|                                                                       |
+-----------------------------------------------------------------------+
|  SELECIONE A MODALIDADE ATIVA (Clique para iniciar ou alternar)       |
|  +-----------------+ +-----------------+ +--------+ +---------------+ |
|  | [●] LEITURA     | | [ ] VIDEOAULA   | | [ ]REV.| | [ ] QUESTÕES  | |
|  |    00:55:10     | |    00:32:08     | | 00:00  | |   00:15:00    | |
|  +-----------------+ +-----------------+ +--------+ +---------------+ |
|                                                                       |
|             [ ⏸ PAUSAR SESSÃO ]        [ ⏹ FINALIZAR ESTUDO ]         |
+-----------------------------------------------------------------------+
|  HISTÓRICO DE HOJE (28/10/2026)               Total Líquido: 03:12:00 |
|  -------------------------------------------------------------------  |
|  Início-Fim | Matéria | Conteúdo | Leit.| Vídeo| Rev. | Quest.| Total |
|  14:00-15:30| RLM     | Lógica   | 00:20| 00:40| 00:00| 00:30 | 01:30 |
+-----------------------------------------------------------------------+

```

### Estados Visuais das Modalidades

* **Modalidade Ativa (`Running`):** Borda iluminada (`border-emerald-500 bg-emerald-950/30`), ícone pulsante e contador em destaque.
* **Modalidade Inativa (com tempo acumulado):** Borda neutra (`border-slate-800 bg-slate-900`), exibindo o tempo já acumulado naquela sessão.
* **Estado Pausado (`Paused`):** O visor principal muda a cor de destaque para âmbar (`text-amber-400`), exibe o badge `"PAUSADO"` e o contador de *Tempo em Intervalos/Pausas* passa a incrementar em tempo real.

---

## 9. Roteiro de Implementação (Passo a Passo para o Agente)

Para construir o projeto sem erros de compilação e facilitar seu acompanhamento do código gerado, peça ao seu agente desenvolvedor para seguir esta ordem exata de etapas:

1. **Etapa 1 — Scaffolding e Dependências:**
* Inicializar projeto Tauri v2 com template React + TypeScript + Vite.
* Configurar Tailwind CSS no frontend.
* Adicionar `rusqlite = { version = "0.32", features = ["bundled"] }`, `chrono = { version = "0.4", features = ["serde"] }` e `serde` no `Cargo.toml`.


2. **Etapa 2 — Camada de Banco de Dados (`db.rs`):**
* Implementar criação da tabela `study_sessions`, rotina de *Crash Recovery* na inicialização e funções de inserção, atualização e busca do histórico do dia e matérias únicas.


3. **Etapa 3 — Domínio e Máquina de Estados (`domain.rs` e `timer.rs`):**
* Implementar `Modality`, `TrackerState` e `ActiveSession` usando `Instant` e `Duration`.
* Escrever testes unitários em Rust (`#[cfg(test)]`) validando a transição entre modalidades e a soma correta dos tempos.


4. **Etapa 4 — Comandos Tauri e Interceptação de Janela (`commands.rs` e `lib.rs`):**
* Expor os comandos IPC com estado protegido por `Mutex`.
* Configurar `on_window_event` para bloquear `CloseRequested` quando a sessão estiver ativa e emitir o evento para o frontend.


5. **Etapa 5 — Interface React + Integração IPC (`src/`):**
* Criar contratos em `src/types/session.ts` e serviços em `src/services/tauriApi.ts`.
* Construir os componentes visuais, o loop de *polling* de `200ms` para atualização fluida do relógio e o modal de confirmação de fechamento.