# ⏱️ StudyChrono

<div align="center">

![Versão](https://img.shields.io/badge/versão-0.1.0-blue.svg?style=for-the-badge)
![Tauri v2](https://img.shields.io/badge/Tauri-v2-24C8D8?style=for-the-badge&logo=tauri&logoColor=white)
![Rust](https://img.shields.io/badge/Rust-2024-000000?style=for-the-badge&logo=rust&logoColor=white)
![React 19](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Tailwind CSS v4](https://img.shields.io/badge/Tailwind-v4-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)
![Docker Ready](https://img.shields.io/badge/Docker-Ready-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![Testes](https://img.shields.io/badge/Testes-26%20Passing-success?style=for-the-badge)

<p align="center">
  <b>Cronômetro de alta precisão para controle de horas líquidas de estudo por modalidades cognitivas.</b><br>
  <i>Desenvolvido com arquitetura dual: Desktop nativo de alta performance (Tauri v2 + Rust) e Web SPA autônoma imune a suspensão de abas.</i>
</p>

[Funcionalidades](#-funcionalidades-principais) •
[Arquitetura Dual](#-arquitetura-do-sistema) •
[Design System](#-design-system-editorial) •
[Como Executar](#-como-executar) •
[Docker & Cloud](#-deploy-em-produção-docker--cloud-run) •
[Especificação Técnica](SPEC.md)

</div>

---

## 📖 Visão Geral

O **StudyChrono** foi projetado para concurseiros, acadêmicos e autodidatas que precisam de medição exata do rendimento de estudos, superando as limitações dos cronômetros convencionais:

1. **Granularidade Real por Modalidade de Absorção:** Em vez de contabilizar apenas um bloco contínuo indiferenciado, o tempo é categorizado em 4 modalidades cognitivas fundamentais (**Leitura**, **Videoaula/Áudio**, **Revisão**, **Questões**) e **Intervalos (Pausas)**.
2. **Precisão Absoluta Zero-Drift:** Imunidade total à lentidão, derrapagem de temporizadores de JavaScript (`setInterval`) ou congelamento de abas em segundo plano (*background throttling*).
3. **Foco Visual Editorial:** Interface 100% limpa durante a sessão ativa, inspirada em tipografia editorial suíça, paleta monocromática sóbria e modo escuro nativo.
4. **Resiliência e Recuperação Automática:** Proteção contra fechamento acidental da janela/aba e auto-recuperação de sessões em caso de queda de energia ou travamento.

---

## 🏛️ Arquitetura do Sistema

O projeto utiliza um design de **Motor Dual (Dual-Engine)** unificado por uma camada de abstração em TypeScript (`tauriApi.ts`):

```text
                                  ┌──────────────────────────────┐
                                  │   Interface do Usuário (UI)  │
                                  │   React 19 + Tailwind CSS    │
                                  └──────────────┬───────────────┘
                                                 │
                                     [tauriApi Abstraction]
                                                 │
                        ┌────────────────────────┴────────────────────────┐
                        ▼                                                 ▼
          ┌───────────────────────────┐                     ┌───────────────────────────┐
          │     Desktop Core (Rust)   │                     │      Web Engine (TS)      │
          │   (Tauri v2 Nativo)       │                     │    (Navegador / Mobile)   │
          ├───────────────────────────┤                     ├───────────────────────────┤
          │ • Instant Monotônico      │                     │ • Timestamps Absolutos    │
          │ • Nanosecond Precision    │                     │ • Imune a Tab Throttling  │
          │ • SQLite Nativo (Bundled) │                     │ • LocalStorage + Google   │
          │ • Window Close Intercept  │                     │ • Visibility & Unload API │
          └───────────────────────────┘                     └───────────────────────────┘
```

### 1. Motor Desktop (Tauri v2 + Rust)
* **Single Source of Truth:** Máquina de estados executada no Rust utilizando `std::time::Instant` e `std::time::Duration`, eliminando perdas de frações de segundo ao alternar modalidades (*sub-second precision*).
* **Persistência Confiável:** Banco de dados SQLite local embutido via `rusqlite` (`bundled`), com WAL (*Write-Ahead Logging*) e checkpoints automáticos.
* **Interceptação Nativa do SO:** Intercepta o evento `CloseRequested` do sistema operacional para prevenir a perda de dados caso o usuário feche a janela com cronômetro em execução.

### 2. Motor Web / Mobile (TypeScript WebTracker)
* **Zero-Drift Web Tracker:** Contagem baseada na diferença entre timestamps absolutos do relógio do sistema (`Date.now()`) e fatias acumuladas, garantindo precisão mesmo com a aba suspensa ou minimizada.
* **Auto-Checkpointing:** Gravação automática a cada 1 segundo e escuta contínua aos eventos `beforeunload` e `visibilitychange`.
* **Crash Recovery Instantâneo:** Ao reabrir a aplicação após uma queda abrupta, sessões interrompidas são recuperadas com status `RECOVERED` ("Encerramento inesperado").

---

## ✨ Funcionalidades Principais

- ⚡ **Início Rápido pela Modalidade (RN01):** Digite a matéria (com autocomplete inteligente baseado no histórico) ou comece direto como *"Estudo Livre"* com apenas um clique na modalidade desejada.
- 🔄 **Hot-Swap de Modalidades sem Perda de Tempo (RN03):** Troque entre *Leitura*, *Videoaula*, *Revisão* e *Questões* instantaneamente. Ao retomar de uma pausa, clique diretamente na modalidade desejada para reiniciar a contagem nela.
- ✏️ **Edição Dinâmica em Tempo Real (RN02):** Corrija a Matéria ou o Tópico durante o estudo com sincronização e salvamento em segundo plano sem pausar o relógio.
- ⏱️ **Visor Principal com Décimos de Segundo Discretos:** Exibição fluida de `.0` a `.9` exclusivamente no relógio principal, oferecendo percepção visual de ritmo sem poluição.
- 📊 **Aba de Histórico e Relatórios Avançados:** 
  - Paginação automática e filtros simultâneos por matéria, período e busca textual.
  - Totalizadores por modalidade e visão detalhada de cada sessão.
  - Edição direta de matéria e tópico em registros passados.
  - Exclusão com modal de confirmação segura.
- 👤 **Modo Visitante & Gestão de Contas:**
  - **Modo Visitante:** Comece a usar imediatamente na primeira visita, sem cadastro ou formulários.
  - **Usuário de Teste:** Alternância rápida para perfil de demonstração em 1 clique.
  - **Google OAuth 2.0:** Suporte oficial a login com conta Google para sincronização.
- ☁️ **Opções de Armazenamento:**
  - Armazenamento 100% Local (privacidade máxima no navegador ou SQLite).
  - Sincronização em nuvem via Google Drive pessoal (`study-chrono-backup.json`).
- 💾 **Portabilidade Total (Backup JSON):** Exportação e importação completa de dados com validação de esquema em um clique.
- 📱 **Design Responsivo & Mobile-First:**
  - No desktop: Cabeçalho unificado com altura padrão (`h-8`), alternância de abas e menu do usuário.
  - No mobile: Barra de navegação inferior fixa com área de segurança para rolagem, centralização da marca e menu adaptado.

---

## 🎨 Design System Editorial

O StudyChrono segue uma estética editorial rigorosa e funcional:

| Elemento | Especificação | Propósito |
| :--- | :--- | :--- |
| **Serif Editorial** | *Romana-Book* (Fallback: *Newsreader Variable*) | Títulos, identidade visual e resumos |
| **Mono Técnico** | *Akkurat-Mono* (Fallback: *Roboto Mono*) | Dígitos tabulares nos cronômetros e badges |
| **Sans Neutra** | *AkkuratPro-Regular* (Fallback: *Inter*) | Textos corridos, botões, modais e formulários |
| **Paleta** | Monocromática estrita (Preto, Cinza, Branco) | Foco absoluto e eliminação de fadiga cognitiva |
| **Acentos de Cor** | Verde esmeralda (Play), Âmbar (Pause) e Vermelho (Stop) | Uso de cor restrito exclusivamente à semântica de controle |
| **Temas** | Claro (*Light*) e Escuro (*Dark*) | Alternância rápida e persistente entre modos visuais |

---

## 🛠️ Tecnologias Utilizadas

### Frontend
- **[React 19](https://react.dev/)** + **[TypeScript 6](https://www.typescriptlang.org/)** + **[Vite 8](https://vite.dev/)**
- **[Tailwind CSS v4](https://tailwindcss.com/)**
- **[Lucide React](https://lucide.dev/)** (Ícones SVG otimizados)
- **Fontsource Variable Fonts** (Newsreader, Inter, Roboto Mono com suporte offline)

### Desktop Backend
- **[Tauri v2](https://tauri.app/)**
- **[Rust (Edition 2024)](https://www.rust-lang.org/)**
- **[SQLite](https://www.sqlite.org/)** via [`rusqlite`](https://crates.io/crates/rusqlite) (`bundled`)
- **[Chrono](https://crates.io/crates/chrono)** e **[Serde](https://serde.rs/)**

### Infraestrutura & Deploy
- **[Docker](https://www.docker.com/)** (Multi-stage build com Node 22 Alpine + Nginx Alpine)
- **[Nginx](https://nginx.org/)** (Configuração com Security Headers, Gzip e roteamento SPA)

---

## 💻 Como Executar

### Pré-requisitos
- [Node.js](https://nodejs.org/) (versão 20 ou superior)
- [Rust & Cargo](https://rustup.rs/) (apenas se for compilar o binário desktop Tauri)

### 1. Clonar o repositório e instalar dependências
```bash
git clone https://github.com/lucaspedrom/study-chrono.git
cd study-chrono
npm install
```

### 2. Executar como Aplicação Web (SPA)
```bash
# Iniciar servidor de desenvolvimento local (Vite)
npm run dev

# Gerar compilação de produção (dist/)
npm run build

# Pré-visualizar a compilação de produção
npm run preview
```
Abra [http://localhost:5173](http://localhost:5173) no seu navegador.

### 3. Executar como Aplicativo Desktop (Tauri v2)
```bash
# Iniciar aplicação com hot-reload no desktop
npm run tauri dev

# Compilar instalador e executável otimizado de produção
npm run tauri build
```
O executável final é gerado na pasta `src-tauri/target/release/`.

---

## 🧪 Suíte de Testes Automatizados

O projeto conta com baterias completas de testes automatizados:

```bash
# Executa testes unitários (WebTracker, Formatações, Recuperação, Auth e UI)
npm test

# Executa testes de responsividade e usabilidade móvel
npm run test:responsive

# Executa testes ponta-a-ponta (E2E) com binário nativo e protocolo Chrome DevTools (CDP)
npm run test:e2e
```

---

## 🐳 Deploy em Produção (Docker / Cloud Run)

O projeto inclui um `Dockerfile` multi-stage com Nginx pré-configurado com cabeçalhos de segurança (`X-Frame-Options`, `Content-Type-Options`, `Permissions-Policy`), compressão Gzip e cache imutável de assets.

### Compilar e rodar via Docker:
```bash
# Construir a imagem Docker
docker build -t study-chrono .

# Rodar o contêiner na porta 8080
docker run -p 8080:8080 study-chrono
```
Acesse [http://localhost:8080](http://localhost:8080).

---

## 📂 Estrutura de Diretórios

```text
study-chrono/
├── public/                 # Favicons e manifestos estáticos
├── src/                    # Código-fonte da aplicação React
│   ├── assets/             # SVGs e imagens auxiliares
│   ├── components/         # Componentes modulares da interface
│   │   ├── CloseConfirmModal.tsx # Confirmação de saída com sessão ativa
│   │   ├── ControlBar.tsx        # Controles Play, Pause e Stop
│   │   ├── HistoryReport.tsx     # Aba de relatório, busca e paginação
│   │   ├── ModalityGrid.tsx      # Grade das 4 modalidades de estudo
│   │   ├── SubjectInput.tsx      # Matéria (com autocomplete) e Tópico
│   │   ├── TimerDisplay.tsx      # Visor principal com décimos discretos
│   │   ├── UserMenuPopover.tsx   # Popover de ações rápidas do usuário
│   │   └── UserProfileModal.tsx  # Modal de conta, Google Auth, nuvem e backup
│   ├── config/             # Configurações globais (Google Client ID, etc.)
│   ├── services/           # Camada de serviços e integração
│   │   ├── authService.ts        # Autenticação de usuários (Visitante/Google)
│   │   ├── googleDriveService.ts # Sincronização via Google Drive API
│   │   ├── tauriApi.ts           # Ponte de abstração (Tauri IPC vs WebTracker)
│   │   └── webTracker.ts         # Motor web de alta precisão e LocalStorage
│   ├── types/              # Definições de tipos TypeScript (Sessão, Histórico)
│   ├── utils/              # Funções de formatação de tempo e hooks de acessibilidade
│   ├── App.tsx             # Orquestrador da aplicação e layout responsivo
│   ├── App.css             # Configuração de temas e declarações @font-face
│   └── main.tsx            # Ponto de entrada do React
├── src-tauri/              # Backend Desktop nativo em Rust
│   ├── src/
│   │   ├── commands.rs     # Comandos IPC #[tauri::command]
│   │   ├── db.rs           # Inicialização do SQLite, queries e migrações
│   │   ├── domain.rs       # Structs de domínio e enums de estado
│   │   ├── lib.rs          # Setup do Tauri, eventos de janela e interceptação
│   │   ├── main.rs         # Ponto de entrada do executável Rust
│   │   └── timer.rs        # Temporizador monotônico e cálculo de deltas
│   ├── Cargo.toml          # Manifesto de dependências e flags de otimização Rust
│   └── tauri.conf.json     # Configuração de janelas, ícones e permissões Tauri
├── tests/                  # Suíte de testes automatizados
│   ├── frontend.test.mts             # Testes unitários do motor Web e UI
│   ├── responsive-usability.test.mts # Testes de layout móvel e adaptativo
│   └── e2e-binary.test.mts           # Testes ponta-a-ponta via CDP
├── Dockerfile              # Build otimizado multi-stage para Cloud Run / Web
├── nginx.conf              # Servidor Nginx com compressão e security headers
├── SPEC.md                 # Especificação técnica e regras de negócio completas
└── README.md               # Documentação principal do projeto
```

---

## 📄 Licença

Este projeto é disponibilizado sob a licença [MIT](LICENSE) para fins de estudo, produtividade e aprimoramento pessoal.
