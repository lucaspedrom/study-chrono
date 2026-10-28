# ⏱️ StudyChrono

> Cronômetro desktop de alta precisão para controle de horas líquidas e brutas de estudo, desenvolvido com **Tauri v2**, **Rust** e **React**.

---

## 📖 Sobre o Projeto

O **StudyChrono** foi concebido para resolver o problema de imprecisão e falta de granularidade em cronômetros convencionais de estudo. 

Ao invés de contabilizar apenas um contador contínuo, a aplicação segmenta o tempo em **quatro modalidades de absorção de conhecimento** e monitora intervalos:
- 📖 **Leitura** (PDFs, livros, apostilas)
- 🎧 **Mídia** (Videoaulas, podcasts, áudio)
- 🔄 **Revisão** (Flashcards, mapas mentais, resumos)
- ✍️ **Resolução de Questões** (Baterias de exercícios, simulados)
- ⏸️ **Pausas / Intervalos** (Descanso controlado)

### 🏛️ Princípio Arquitetural: *Thick Rust Core + Dumb Reactive UI*
Para garantir que nenhuma fração de segundo seja perdida ou afetada por pausas de renderização no navegador (como throttling de abas ou atrasos do event loop de JavaScript):
1. **Rust (Backend):** É a fonte única da verdade (*Single Source of Truth*). Todo o controle de tempo, cálculo de deltas com relógio monotônico (`std::time::Instant`) e persistência transacional residem no Rust.
2. **React + TypeScript (Frontend):** Atua estritamente como interface de visualização e envio de ações do usuário, sem timers autônomos de gravação.

---

## 🛠️ Tecnologias Utilizadas

- **Framework Desktop:** [Tauri v2](https://tauri.app/)
- **Linguagem Backend:** [Rust](https://www.rust-lang.org/) (Edition 2024)
- **Banco de Dados:** [SQLite](https://www.sqlite.org/) via [`rusqlite`](https://crates.io/crates/rusqlite) (modo `bundled`, sem dependências externas)
- **Frontend:** [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/) e [Vite](https://vite.dev/)
- **Estilização & Ícones:** [Tailwind CSS v4](https://tailwindcss.com/) e [Lucide React](https://lucide.dev/)

---

## 🚀 O Que Já Está Pronto

Até esta etapa inicial de desenvolvimento, os seguintes pilares foram construídos e validados:

- [x] **Setup do Projeto**: Estrutura híbrida Tauri v2 configurada com Vite, React, TypeScript e Tailwind CSS.
- [x] **Especificação Técnica Detalhada**: Documento arquitetural completo em [`SPEC.md`](./SPEC.md) cobrindo modelos de dados, endpoints IPC e especificações de tela.
- [x] **Camada de Banco de Dados Local (SQLite)**:
  - Inicialização automática do banco `study_chrono.db` no diretório de dados do aplicativo.
  - Criação da tabela `study_sessions` com índices por data e matéria.
  - **Mecanismo de Tolerância a Falhas**: Função `recover_dangling_sessions` que recupera ou finaliza graciosamente sessões que ficaram abertas após queda de energia ou fechamento abrupto do sistema.
  - Funções nativas de persistência: criação de nova sessão e consulta otimizada de matérias distintas para autocompletar (`get_distinct_subjects`).

---

## 🗺️ Próximos Passos (Roadmap)

- [ ] Implementação da máquina de estados do Timer em Rust com relógio monotônico.
- [ ] Mapeamento e exportação de Tauri Commands (IPC) para comunicação tipada entre Rust e React.
- [ ] Criação dos componentes da interface:
  - Seletor de Matéria e Tópico com autocompletar.
  - Display principal com tempo líquido e modalidade ativa.
  - Grid das 4 modalidades de estudo com contadores em tempo real.
  - Painel de histórico diário com métricas de tempo bruto vs. líquido.
- [ ] Interceptação do evento de fechamento de janela nativa (`on_window_event`) para evitar fechar a aplicação com sessão ativa sem confirmação.

---

## 💻 Como Executar Localmente

### Pré-requisitos
- [Node.js](https://nodejs.org/) (v18 ou superior)
- [Rust & Cargo](https://rustup.rs/)
- Dependências de sistema necessárias para o Tauri no seu sistema operacional (consulte a [documentação do Tauri](https://tauri.app/start/prerequisites/)).

### Passos

1. Clone o repositório:
   ```bash
   git clone https://github.com/<seu-usuario>/study-chrono.git
   cd study-chrono
   ```

2. Instale as dependências do frontend:
   ```bash
   npm install
   ```

3. Execute a aplicação em modo de desenvolvimento (inicia o Vite e o runtime Tauri):
   ```bash
   npm run tauri dev
   ```

---

## 📄 Licença

Este projeto é desenvolvido para fins de estudo e aprimoramento pessoal.
