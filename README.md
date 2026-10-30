# ⏱️ StudyChrono

> Cronômetro desktop de alta precisão para controle de horas líquidas e brutas de estudo, desenvolvido com **Tauri v2**, **Rust** e **React + TypeScript**.

---

## 📖 Sobre o Projeto

O **StudyChrono** foi concebido para resolver o problema de imprecisão e falta de granularidade em cronômetros convencionais de estudo.

Ao invés de contabilizar apenas um contador contínuo, a aplicação segmenta o tempo em **quatro modalidades de absorção de conhecimento** e monitora intervalos:
- 📖 **Leitura** (PDFs, livros, apostilas)
- 🎧 **Videoaula / Áudio** (Videoaulas, podcasts, áudio)
- 🔄 **Revisão** (Flashcards, mapas mentais, resumos)
- ✍️ **Questões** (Baterias de exercícios, simulados)
- ⏸️ **Pausas / Intervalos** (Descanso controlado)

### 🏛️ Princípio Arquitetural: *Thick Rust Core + Dumb Reactive UI*
1. **Rust (Backend Core):** É a única fonte da verdade (*Single Source of Truth*). Todo o controle da máquina de estados, cálculo de deltas com relógio monotônico (`std::time::Instant` e `std::time::Duration` sem perda de frações de segundo), checkpoints transacionais em SQLite e interceptação nativa de fechamento residem no Rust.
2. **React + TypeScript (Frontend UI):** Atua exclusivamente como camada de apresentação e disparo de intenções via IPC tipado, atualizando o visor com *polling* adaptativo (`50ms` em execução para fluidez dos décimos e `200ms` em pausa).

---

## 🛠️ Tecnologias Utilizadas

- **Framework Desktop:** [Tauri v2](https://tauri.app/)
- **Linguagem Backend:** [Rust](https://www.rust-lang.org/)
- **Banco de Dados:** [SQLite](https://www.sqlite.org/) via [`rusqlite`](https://crates.io/crates/rusqlite) (`bundled`)
- **Frontend:** [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/) e [Vite](https://vite.dev/)
- **Estilização & Ícones:** [Tailwind CSS v4](https://tailwindcss.com/) e [Lucide React](https://lucide.dev/)

---

## ✅ Funcionalidades Implementadas

- [x] **Aplicação Web (SPA) Autônoma:** Funciona diretamente no navegador web (`npm run dev` / `npm run build`), desktop ou mobile, sem depender de backend externo ou container local.
- [x] **Metodologia de Contagem Temporal com Precisão Absoluta na Web:** Contagem imune à desaceleração e congelamento de abas em segundo plano (*background throttling* de `setInterval`/suspensão de aba) através do diferencial de timestamps absolutos (`Date.now()` / relógio do sistema) somado aos acumuladores em milissegundos.
- [x] **Proteção contra Fechamento Inesperado de Aba / Queda de Conexão:** Checkpointing a cada segundo e nos eventos `beforeunload` e `visibilitychange`. Sessões interrompidas inesperadamente são convertidas automaticamente para `RECOVERED` ("Encerramento inesperado") ao reabrir o site.
- [x] **Modo Visitante sem Burocracia:** O cronômetro fica pronto para uso imediato logo na primeira visita à página. Ao iniciar a contagem em modo visitante, uma notificação elegante orienta o usuário sobre o armazenamento local e incentiva o login para sincronização em nuvem.
- [x] **Perfil de Usuário, Login de Demonstração e Configuração de Armazenamento:** Ícone de usuário no canto superior direito com acesso a login de teste em 1 clique ("Entrar como Usuário de Teste"), configuração de Google OAuth Client ID e seleção de modo de armazenamento (Armazenamento Local no Navegador vs Google Drive Pessoal).
- [x] **Portabilidade e Backup dos Dados:** Exportação e importação completa do histórico de estudos em formato JSON.
- [x] **Início Rápido pela Modalidade (RN01):** Preencha a Matéria (com autocomplete inteligente) e clique diretamente na modalidade desejada para iniciar.
- [x] **Décimos de Segundo Discretos no Visor Principal:** Contagem fluida de `.0` a `.9` exclusivamente no relógio principal.
- [x] **Tela de Cronômetro 100% Limpa e Minimalista:** Foco integral na sessão ativa, sem poluição de tabelas ou resumos do dia.
- [x] **Sistema Tipográfico Editorial & Paleta Monocromática (Temas Claro e Escuro):** Combinação de três famílias tipográficas — *Romana-Book* (serifa editorial nos títulos), *AkkuratPro-Regular* (sans-serif limpa em textos e entradas) e *Akkurat-Mono* (monoespaçada com dígitos tabulares fixos nos cronômetros, rótulos técnicos e ações) — aliada à paleta estrita em preto, cinza e branco (com cor apenas nos ícones Play, Pause e Stop) e seletor persistente entre **Tema Claro** e **Tema Escuro**.
- [x] **Edição Dinâmica em Tempo Real (RN02):** Altere Matéria ou Conteúdo durante o estudo com sincronização automática.
- [x] **Hot-Swap de Modalidades sem Perda Sub-segundo (RN03):** Troca instantânea entre modalidades e retomada direta a partir do estado pausado.
- [x] **Relatório e Gerenciamento de Histórico de Estudos:** Aba dedicada com paginação automática, filtros por matéria/data/texto, consolidado por modalidade, edição de Matéria e Tópico e exclusão protegida por confirmação.

---

## 💻 Como Executar e Testar

```bash
# Instalar dependências
npm install

# Executar como Aplicação Web (SPA) em modo de desenvolvimento
npm run dev

# Gerar build de produção Web otimizado
npm run build

# Pré-visualizar build de produção
npm run preview

# Executar suíte de testes unitários automatizados (Frontend + WebTracker)
npm test

# (Opcional) Executar modo desktop Tauri (quando ambiente nativo configurado)
npm run tauri dev
```

---

## 📄 Licença

Este projeto é desenvolvido para fins de estudo e aprimoramento pessoal.
