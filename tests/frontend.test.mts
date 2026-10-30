import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Module from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

// Hook usando o próprio compilador TypeScript do projeto para importar componentes .tsx/.ts nos testes
Module.registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      !path.extname(specifier) &&
      context.parentURL?.startsWith("file:")
    ) {
      const parentDir = path.dirname(fileURLToPath(context.parentURL));
      for (const ext of [".ts", ".tsx"]) {
        const candidate = path.resolve(parentDir, specifier + ext);
        if (fs.existsSync(candidate)) {
          return {
            url: pathToFileURL(candidate).href,
            shortCircuit: true,
          };
        }
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith(".css")) {
      return {
        format: "module",
        source: "export default {};",
        shortCircuit: true,
      };
    }
    if (url.endsWith(".tsx") || url.endsWith(".ts")) {
      const filePath = fileURLToPath(url);
      const source = fs.readFileSync(filePath, "utf8");
      const transpiled = ts.transpileModule(source, {
        fileName: filePath,
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.ReactJSX,
        },
      });
      return {
        format: "module",
        source: transpiled.outputText,
        shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  },
});

const {
  formatSeconds,
  formatMainClock,
  formatDateBR,
  formatIsoTimeHHMM,
  formatSessionRange,
  filterSubjectSuggestions,
} = await import(pathToFileURL(path.join(rootDir, "src/utils/formatTime.ts")).href);

const { IDLE_SNAPSHOT } = await import(
  pathToFileURL(path.join(rootDir, "src/types/session.ts")).href
);
const { TimerDisplay } = await import(
  pathToFileURL(path.join(rootDir, "src/components/TimerDisplay.tsx")).href
);
const { ModalityGrid } = await import(
  pathToFileURL(path.join(rootDir, "src/components/ModalityGrid.tsx")).href
);
const { ControlBar } = await import(
  pathToFileURL(path.join(rootDir, "src/components/ControlBar.tsx")).href
);
const { HistoryReport } = await import(
  pathToFileURL(path.join(rootDir, "src/components/HistoryReport.tsx")).href
);
const { CloseConfirmModal } = await import(
  pathToFileURL(path.join(rootDir, "src/components/CloseConfirmModal.tsx")).href
);
const { SubjectInput } = await import(
  pathToFileURL(path.join(rootDir, "src/components/SubjectInput.tsx")).href
);
const { UserProfileModal } = await import(
  pathToFileURL(path.join(rootDir, "src/components/UserProfileModal.tsx")).href
);
const { UserMenuPopover } = await import(
  pathToFileURL(path.join(rootDir, "src/components/UserMenuPopover.tsx")).href
);
const {
  computeSnapshot,
  getInitialDataWeb,
  startOrSwitchModalityWeb,
  togglePauseWeb,
  stopSessionWeb,
  saveActiveSession,
  saveActiveSessionCheckpoint,
  saveHistorySessions,
  clearMemoryStoreForTesting,
  exportDataAsJson,
  importDataFromJson,
} = await import(
  pathToFileURL(path.join(rootDir, "src/services/webTracker.ts")).href
);
const { default: App } = await import(
  pathToFileURL(path.join(rootDir, "src/App.tsx")).href
);


test("formatSeconds formata limites, valores negativos, NaN e mais de 100 horas", () => {
  assert.equal(formatSeconds(0), "00:00:00");
  assert.equal(formatSeconds(59), "00:00:59");
  assert.equal(formatSeconds(60), "00:01:00");
  assert.equal(formatSeconds(3661), "01:01:01");
  assert.equal(formatSeconds(6138), "01:42:18");
  assert.equal(formatSeconds(360000), "100:00:00");
  assert.equal(formatSeconds(-15), "00:00:00");
  assert.equal(formatSeconds(Number.NaN), "00:00:00");
  assert.equal(formatSeconds(12.9), "00:00:12");
});

test("formatMainClock calcula décimos de segundo (.0 a .9) sem arredondar .99 para .10 e trata limites", () => {
  assert.deepEqual(formatMainClock(0, 0), { main: "00:00:00", tenths: "0" });
  assert.deepEqual(formatMainClock(99, 0), { main: "00:00:00", tenths: "0" });
  assert.deepEqual(formatMainClock(100, 0), { main: "00:00:00", tenths: "1" });
  assert.deepEqual(formatMainClock(999, 0), { main: "00:00:00", tenths: "9" });
  assert.deepEqual(formatMainClock(1000, 1), { main: "00:00:01", tenths: "0" });
  assert.deepEqual(formatMainClock(6138740, 6138), {
    main: "01:42:18",
    tenths: "7",
  });
  // Soma sub-segundo entre modalidades (ex: 2.8s + 0.3s = 3.1s enquanto soma truncada = 2s)
  assert.deepEqual(formatMainClock(3100, 2), { main: "00:00:03", tenths: "1" });
  // Fallback seguro quando apenas totalActiveSec foi informado
  assert.deepEqual(formatMainClock(0, 6138), { main: "01:42:18", tenths: "0" });
  assert.deepEqual(formatMainClock(undefined, 95), {
    main: "00:01:35",
    tenths: "0",
  });
  assert.deepEqual(formatMainClock(-500, -10), {
    main: "00:00:00",
    tenths: "0",
  });
  assert.deepEqual(formatMainClock(Number.NaN, Number.NaN), {
    main: "00:00:00",
    tenths: "0",
  });
});

test("formatDateBR e formatSessionRange formatam datas e intervalos ISO-8601", () => {
  assert.equal(formatDateBR("2026-10-29"), "29/10/2026");
  assert.equal(formatDateBR(""), "--/--/----");
  assert.equal(formatIsoTimeHHMM("2026-10-29T14:05:12-03:00"), "14:05");
  assert.equal(formatIsoTimeHHMM(null), "--:--");
  assert.equal(
    formatSessionRange(
      "2026-10-29T14:00:00-03:00",
      "2026-10-29T15:30:45-03:00",
    ),
    "14:00–15:30",
  );
  assert.equal(
    formatSessionRange("2026-10-29T14:00:00-03:00", null),
    "14:00–--:--",
  );
});

test("filterSubjectSuggestions ignora acentos/caixa na busca, mantém forma canônica e oculta correspondência idêntica", () => {
  const subjects = [
    "Direito Administrativo",
    "Direito Constitucional",
    "Português",
    "Raciocínio Lógico",
  ];
  assert.deepEqual(filterSubjectSuggestions(subjects, "logico"), [
    "Raciocínio Lógico",
  ]);
  assert.deepEqual(filterSubjectSuggestions(subjects, "direito"), [
    "Direito Administrativo",
    "Direito Constitucional",
  ]);
  assert.deepEqual(filterSubjectSuggestions(subjects, "portugues"), [
    "Português",
  ]);
  assert.deepEqual(filterSubjectSuggestions(subjects, "Português"), []);
  assert.deepEqual(filterSubjectSuggestions(subjects, "  Português  "), []);
  assert.equal(filterSubjectSuggestions(subjects, "").length, 4);
});

test("TimerDisplay renderiza décimos discretos (.0 a .9) apenas no visor principal e paleta monocromática", () => {
  const idleHtml = renderToStaticMarkup(
    React.createElement(TimerDisplay, { snapshot: IDLE_SNAPSHOT }),
  );
  assert.match(idleHtml, /00:00:00/);
  assert.match(idleHtml, /\.0/);
  assert.match(idleHtml, /Pronto/);
  assert.doesNotMatch(idleHtml, /(emerald|amber|rose|slate)-/);

  const runningHtml = renderToStaticMarkup(
    React.createElement(TimerDisplay, {
      snapshot: {
        ...IDLE_SNAPSHOT,
        status: "running",
        activeModality: "reading",
        lastModality: "reading",
        totalActiveSec: 6138,
        totalActiveMs: 6138700,
        pausedSec: 725,
      },
    }),
  );
  assert.match(runningHtml, /01:42:18/);
  assert.match(runningHtml, /\.7/);
  assert.match(runningHtml, /EM ANDAMENTO/);
  assert.match(runningHtml, /Leitura/);
  assert.match(runningHtml, /Tempo em Intervalos\/Pausas: 00:12:05</);
  assert.doesNotMatch(runningHtml, /(emerald|amber|rose|slate)-/);

  const pausedHtml = renderToStaticMarkup(
    React.createElement(TimerDisplay, {
      snapshot: {
        ...IDLE_SNAPSHOT,
        status: "paused",
        activeModality: null,
        lastModality: "questions",
        totalActiveSec: 1800,
        totalActiveMs: 1800400,
        pausedSec: 95,
      },
    }),
  );
  assert.match(pausedHtml, /PAUSADO/);
  assert.match(pausedHtml, /\.4/);
  assert.match(pausedHtml, /text-neutral-500/);
  assert.match(pausedHtml, /Questões/);
  assert.match(pausedHtml, /00:01:35/);
  assert.doesNotMatch(pausedHtml, /(emerald|amber|rose|slate)-/);
});

test("ModalityGrid e ControlBar preservam botões monocromáticos e limitam cores aos ícones Play, Pause e Stop", () => {
  const gridHtml = renderToStaticMarkup(
    React.createElement(ModalityGrid, {
      snapshot: {
        ...IDLE_SNAPSHOT,
        status: "running",
        activeModality: "media",
        readingSec: 3310,
        mediaSec: 1928,
        reviewSec: 0,
        questionsSec: 900,
      },
      onSelectModality: () => {},
    }),
  );
  assert.match(gridHtml, /00:55:10/);
  assert.match(gridHtml, /00:32:08/);
  assert.match(gridHtml, /00:15:00/);
  assert.match(gridHtml, /aria-pressed="true"/);
  assert.doesNotMatch(gridHtml, /\b(emerald|amber|rose|slate)-/);
  assert.doesNotMatch(gridHtml, /:\d{2}\.\d/);

  const disabledGridHtml = renderToStaticMarkup(
    React.createElement(ModalityGrid, {
      snapshot: IDLE_SNAPSHOT,
      disabled: true,
      onSelectModality: () => {},
    }),
  );
  assert.match(disabledGridHtml, /disabled=""/);

  const idleControls = renderToStaticMarkup(
    React.createElement(ControlBar, {
      status: "idle",
      isBusy: false,
      onTogglePause: () => {},
      onStopSession: () => {},
    }),
  );
  assert.match(idleControls, /disabled=""/);
  assert.match(idleControls, /Pausar Sessão/);
  // Quando desabilitado em idle, nem mesmo os ícones carregam cor
  assert.doesNotMatch(idleControls, /\b(emerald|amber|rose)-/);

  const runningControls = renderToStaticMarkup(
    React.createElement(ControlBar, {
      status: "running",
      isBusy: false,
      onTogglePause: () => {},
      onStopSession: () => {},
    }),
  );
  assert.match(runningControls, /text-amber-600/);
  assert.match(runningControls, /text-rose-600/);

  const pausedControls = renderToStaticMarkup(
    React.createElement(ControlBar, {
      status: "paused",
      isBusy: false,
      onTogglePause: () => {},
      onStopSession: () => {},
    }),
  );
  assert.match(pausedControls, /Retomar Sessão/);
  assert.match(pausedControls, /text-emerald-600/);
  assert.match(pausedControls, /text-rose-600/);
});

test("App exibe aba Cronômetro 100% limpa (sem histórico/resumo), abas e temas Claro/Escuro", () => {
  const appHtml = renderToStaticMarkup(React.createElement(App));
  assert.match(appHtml, /Cronômetro/);
  assert.match(appHtml, /Histórico/);
  assert.match(appHtml, /Claro/);
  assert.match(appHtml, /Escuro/);
  assert.doesNotMatch(appHtml, /Histórico de Hoje/);
  assert.doesNotMatch(appHtml, /Relatório de Estudos Realizados/);
});

test("HistoryReport renderiza relatório, edição e pop-up de confirmação de exclusão", () => {
  const sampleSession = {
    id: 1,
    studyDate: "2026-10-29",
    startTime: "2026-10-29T14:00:00-03:00",
    endTime: "2026-10-29T15:35:00-03:00",
    subject: "RLM",
    topic: "Lógica Proposicional",
    timeReadingSec: 1200,
    timeMediaSec: 2400,
    timeReviewSec: 0,
    timeQuestionsSec: 1800,
    timePausedSec: 300,
    totalActiveSec: 5400,
    status: "RECOVERED" as const,
  };

  const emptyReportHtml = renderToStaticMarkup(
    React.createElement(HistoryReport, {
      sessions: [],
      subjects: [],
      onEditSession: async () => {},
      onDeleteSession: async () => {},
    }),
  );
  assert.match(
    emptyReportHtml,
    /Nenhum registro de estudo encontrado no histórico\./,
  );

  const historyHtml = renderToStaticMarkup(
    React.createElement(HistoryReport, {
      sessions: [sampleSession],
      subjects: ["RLM"],
      onEditSession: async () => {},
      onDeleteSession: async () => {},
    }),
  );
  assert.match(historyHtml, /Relatório de Estudos Realizados/);
  assert.match(historyHtml, /29\/10\/2026/);
  assert.match(historyHtml, /01:30:00/);
  assert.match(historyHtml, /14:00–15:35/);
  assert.match(historyHtml, /Lógica Proposicional/);
  assert.match(historyHtml, /Rec\./);
  assert.match(historyHtml, /Editar/);
  assert.match(historyHtml, /Excluir/);
  assert.doesNotMatch(historyHtml, /\b(emerald|amber|rose|slate)-/);

  const editModalHtml = renderToStaticMarkup(
    React.createElement(HistoryReport, {
      sessions: [sampleSession],
      subjects: ["RLM", "Raciocínio Lógico"],
      initialEditingSession: sampleSession,
      onEditSession: async () => {},
      onDeleteSession: async () => {},
    }),
  );
  assert.match(editModalHtml, /Editar Registro de Estudo/);
  assert.match(editModalHtml, /Salvar Alterações/);
  assert.doesNotMatch(editModalHtml, /<datalist/i);

  // Quando CloseConfirmModal sobrepõe o modal de edição, o modal inferior fica aria-hidden
  const stackedEditModalHtml = renderToStaticMarkup(
    React.createElement(HistoryReport, {
      sessions: [sampleSession],
      subjects: ["RLM"],
      isCloseModalOpen: true,
      initialEditingSession: sampleSession,
      onEditSession: async () => {},
      onDeleteSession: async () => {},
    }),
  );
  assert.match(stackedEditModalHtml, /aria-modal="false"/);
  assert.match(stackedEditModalHtml, /aria-hidden="true"/);

  const deletePopupHtml = renderToStaticMarkup(
    React.createElement(HistoryReport, {
      sessions: [sampleSession],
      subjects: ["RLM"],
      initialDeletingSession: sampleSession,
      onEditSession: async () => {},
      onDeleteSession: async () => {},
    }),
  );
  assert.match(deletePopupHtml, /Confirmar Exclusão/);
  assert.match(
    deletePopupHtml,
    /Tem certeza de que deseja excluir permanentemente este registro de estudo\?/,
  );
  assert.match(deletePopupHtml, /Cancelar/);
  assert.doesNotMatch(deletePopupHtml, /\b(emerald|amber|rose|slate)-/);

  // Paginação sob carga (> 2.000 sessões): limita o DOM a 100 linhas e mantém totais exatos
  const bulkSessions = Array.from({ length: 2500 }, (_, i) => ({
    ...sampleSession,
    id: i + 1,
    timeReadingSec: 60,
    timeMediaSec: 0,
    timeReviewSec: 0,
    timeQuestionsSec: 0,
    timePausedSec: 0,
    totalActiveSec: 60,
  }));
  const bulkHtml = renderToStaticMarkup(
    React.createElement(HistoryReport, {
      sessions: bulkSessions,
      subjects: ["RLM"],
      onEditSession: async () => {},
      onDeleteSession: async () => {},
    }),
  );
  const renderedRows = (bulkHtml.match(/data-session-id="/g) ?? []).length;
  assert.equal(renderedRows, 100, "Deve montar apenas 100 linhas por página no DOM");
  assert.match(bulkHtml, /2500 registros/);
  // 2500 * 60s = 150.000s = 41:40:00 no Total Líquido consolidado
  assert.match(bulkHtml, /41:40:00/);
  assert.match(bulkHtml, /Página 1 de 25/);
});

test("SubjectInput, CloseConfirmModal, App e App.css aplicam o sistema tipográfico de 3 famílias (Romana-Book, Akkurat-Mono e AkkuratPro-Regular) e modo claro/escuro", () => {
  const inputHtml = renderToStaticMarkup(
    React.createElement(SubjectInput, {
      subject: "",
      topic: "",
      subjects: ["Direito Constitucional"],
      subjectError: "Informe a matéria para iniciar o cronômetro.",
      subjectInputRef: { current: null },
      onSubjectChange: () => {},
      onTopicChange: () => {},
      onMetadataCommit: () => {},
    }),
  );
  assert.match(inputHtml, /aria-invalid="true"/);
  assert.match(inputHtml, /Informe a matéria para iniciar o cronômetro\./);
  assert.match(inputHtml, /<label[^>]*class="[^"]*\bfont-mono\b/);
  assert.match(inputHtml, /<input[^>]*id="subject-input"[^>]*class="[^"]*\bfont-sans\b/);
  assert.doesNotMatch(inputHtml, /(emerald|amber|rose|slate)-/);

  const modalHtml = renderToStaticMarkup(
    React.createElement(CloseConfirmModal, {
      isOpen: true,
      isClosing: false,
      onContinueStudying: () => {},
      onConfirmClose: () => {},
    }),
  );
  assert.match(modalHtml, /Você possui uma sessão de estudo em andamento/);
  assert.match(modalHtml, /Continuar Estudando/);
  assert.match(modalHtml, /Encerrar, Salvar e Sair/);
  assert.match(modalHtml, /<h3[^>]*class="[^"]*\bfont-serif\b/);
  assert.match(modalHtml, /<p[^>]*class="[^"]*\bfont-sans\b/);
  assert.match(modalHtml, /<button[^>]*class="[^"]*\bfont-mono\b/);
  assert.doesNotMatch(modalHtml, /(emerald|amber|rose|slate)-/);

  const appHtml = renderToStaticMarkup(React.createElement(App));
  assert.match(appHtml, /<h1[^>]*class="[^"]*\bfont-serif\b[^>]*>StudyChrono<\/h1>/);
  assert.match(appHtml, /<h2[^>]*class="[^"]*\bfont-serif\b[^>]*>Tempo Líquido de Estudo<\/h2>/);

  const cssContent = fs.readFileSync(path.join(rootDir, "src/App.css"), "utf8");
  assert.match(cssContent, /"Romana-Book",\s*"Times New Roman",\s*serif/);
  assert.match(cssContent, /"Akkurat-Mono",\s*"Andale Mono"/);
  assert.match(cssContent, /'AkkuratPro-Regular'/);
  assert.match(cssContent, /@font-face/);
  // Garante que Andale Mono atua apenas como fallback de família em --font-mono, sem sequestrar Akkurat-Mono no @font-face
  assert.doesNotMatch(cssContent, /local\(\s*["']Andale Mono["']\s*\)/);
  // Garante que fontes estáticas locais Regular/Book não são declaradas com faixas variáveis completas (que suprimem negrito no Blink)
  assert.doesNotMatch(cssContent, /font-weight:\s*100\s+900[\s\S]{0,160}local\(\s*["']AkkuratPro-Regular["']\s*\)/);
  assert.doesNotMatch(cssContent, /font-weight:\s*100\s+700[\s\S]{0,160}local\(\s*["']Akkurat-Mono["']\s*\)/);
  assert.doesNotMatch(cssContent, /font-weight:\s*200\s+800[\s\S]{0,160}local\(\s*["']Romana-Book["']\s*\)/);
  assert.match(cssContent, /roboto-mono-latin-wght-italic\.woff2/);
  assert.match(cssContent, /@custom-variant dark/);
  assert.match(cssContent, /tabular-nums/);
  assert.match(cssContent, /button:focus-visible/);
  assert.match(cssContent, /::-webkit-datetime-edit-day-field:focus/);

  const historyFixedHtml = renderToStaticMarkup(
    React.createElement(HistoryReport, {
      sessions: [
        {
          id: 99,
          studyDate: "2026-10-29",
          startTime: "2026-10-29T08:00:00-03:00",
          endTime: "2026-10-29T09:30:00-03:00",
          subject: "Direito Constitucional Avançado",
          topic: "Controle Concentrado de Constitucionalidade no STF",
          timeReadingSec: 1800,
          timeMediaSec: 1800,
          timeReviewSec: 900,
          timeQuestionsSec: 900,
          timePausedSec: 300,
          totalActiveSec: 5400,
          status: "RECOVERED" as const,
        },
      ],
      subjects: ["Direito Constitucional Avançado"],
      onEditSession: async () => {},
      onDeleteSession: async () => {},
    }),
  );
  assert.match(historyFixedHtml, /<table[^>]*class="[^"]*\btable-fixed\b/);
  assert.match(historyFixedHtml, /<colgroup>/);
});

test("UserProfileModal renderiza Modo Visitante, Usuário Autenticado, opções de armazenamento e paleta monocromática", () => {
  // 1) Quando fechado
  const closedHtml = renderToStaticMarkup(
    React.createElement(UserProfileModal, {
      isOpen: false,
      user: null,
      storageMode: "local",
      googleClientId: "",
      onClose: () => {},
      onLoginDemo: () => {},
      onLogout: () => {},
      onUpdateStorageMode: () => {},
      onUpdateGoogleClientId: () => {},
      onExportBackup: () => {},
      onImportBackup: async () => true,
    }),
  );
  assert.equal(closedHtml, "");

  // 2) Modo Visitante (não autenticado)
  const guestHtml = renderToStaticMarkup(
    React.createElement(UserProfileModal, {
      isOpen: true,
      user: null,
      storageMode: "local",
      googleClientId: "",
      onClose: () => {},
      onLoginDemo: () => {},
      onLogout: () => {},
      onUpdateStorageMode: () => {},
      onUpdateGoogleClientId: () => {},
      onExportBackup: () => {},
      onImportBackup: async () => true,
    }),
  );
  assert.match(guestHtml, /Perfil e Armazenamento/);
  assert.match(guestHtml, /Modo Visitante/);
  assert.match(guestHtml, /Continuar com o Google/);
  assert.match(guestHtml, /Armazenamento Local no Navegador/);
  assert.match(guestHtml, /Google Drive Pessoal/);
  assert.doesNotMatch(guestHtml, /Google OAuth Client ID/);
  assert.match(guestHtml, /Exportar Backup \(JSON\)/);
  assert.match(guestHtml, /Importar Backup \(JSON\)/);
  assert.match(guestHtml, /Como Funciona o Fechamento Inesperado/);
  assert.doesNotMatch(guestHtml, /\b(amber|rose|slate)-/);

  // 3) Modo Usuário Autenticado (Demonstração / Teste)
  const userHtml = renderToStaticMarkup(
    React.createElement(UserProfileModal, {
      isOpen: true,
      user: {
        id: "demo_user_1",
        name: "Lucas Estudante",
        email: "lucas.estudante@studychrono.web",
        isDemo: true,
        provider: "demo",
        storageMode: "local",
      },
      storageMode: "local",
      googleClientId: "123456-abc.apps.googleusercontent.com",
      onClose: () => {},
      onLoginDemo: () => {},
      onLogout: () => {},
      onUpdateStorageMode: () => {},
      onUpdateGoogleClientId: () => {},
      onExportBackup: () => {},
      onImportBackup: async () => true,
    }),
  );
  assert.match(userHtml, /Lucas Estudante/);
  assert.match(userHtml, /lucas\.estudante@studychrono\.web/);
  assert.match(userHtml, /Teste \/ Demo/);
  assert.match(userHtml, /Sair da Conta \(Logout\)/);
  assert.doesNotMatch(userHtml, /\b(emerald|amber|rose|slate)-/);
});

test("WebTracker calcula tempo por diferencial de timestamps absolutos sem deriva de intervalos e suporta hot-swap e pausa", () => {
  clearMemoryStoreForTesting();
  const baseTime = 1700000000000;

  // 1) Teste de cálculo diferencial de snapshot
  const activeSession = {
    id: 101,
    studyDate: "2026-10-30",
    startTime: new Date(baseTime).toISOString(),
    subject: "Direito Constitucional",
    topic: "Direitos Fundamentais",
    status: "running" as const,
    activeModality: "reading" as const,
    lastModality: "reading" as const,
    // Simula que a fatia começou há exatamente 3.661.700ms (01:01:01 e 7 décimos)
    sliceStartTime: Date.now() - 3661700,
    readingMs: 0,
    mediaMs: 0,
    reviewMs: 0,
    questionsMs: 0,
    pausedMs: 0,
    lastHeartbeat: Date.now(),
  };

  const snap = computeSnapshot(activeSession);
  assert.equal(snap.status, "running");
  assert.equal(snap.activeModality, "reading");
  assert.equal(snap.readingSec, 3661);
  assert.equal(snap.totalActiveSec, 3661);
  assert.equal(Math.floor((snap.totalActiveMs % 1000) / 100), 7);

  // 2) Teste de início, hot-swap de modalidade e pausa
  const snap1 = startOrSwitchModalityWeb("reading", "Português", "Sintaxe");
  assert.equal(snap1.status, "running");
  assert.equal(snap1.activeModality, "reading");
  assert.equal(snap1.subject, "Português");

  // Pausar
  const snapPaused = togglePauseWeb();
  assert.equal(snapPaused.status, "paused");
  assert.equal(snapPaused.activeModality, null);

  // Retomar direto em Revisão
  const snapResume = startOrSwitchModalityWeb("review", "Português", "Sintaxe");
  assert.equal(snapResume.status, "running");
  assert.equal(snapResume.activeModality, "review");

  // Parar estudo e consolidar
  const summary = stopSessionWeb();
  assert.ok(summary.sessions.length >= 1);
  assert.equal(summary.sessions[0].status, "COMPLETED");
  assert.equal(summary.sessions[0].subject, "Português");
});

test("WebTracker recupera sessão interrompida por fechamento inesperado de navegador com status RECOVERED", () => {
  clearMemoryStoreForTesting();
  const startTimeMs = Date.now() - 5400000; // 1h30m atrás
  const heartbeatMs = startTimeMs + 3600000; // Ficou aberta por 1h (3600s)

  // Simula uma sessão ativa deixada no localStorage após crash / fechamento forçado da aba
  saveActiveSession({
    id: 999,
    studyDate: "2026-10-30",
    startTime: new Date(startTimeMs).toISOString(),
    subject: "Raciocínio Lógico",
    topic: "Tautologia",
    status: "running",
    activeModality: "questions",
    lastModality: "questions",
    sliceStartTime: startTimeMs,
    readingMs: 0,
    mediaMs: 0,
    reviewMs: 0,
    questionsMs: 0,
    pausedMs: 0,
    lastHeartbeat: heartbeatMs,
  });

  // Ao inicializar o aplicativo, detecta a sessão interrompida e salva como RECOVERED
  const initial = getInitialDataWeb();
  assert.equal(initial.recoveredSessions.length, 1);
  const recovered = initial.recoveredSessions[0];
  assert.equal(recovered.status, "RECOVERED");
  assert.equal(recovered.subject, "Raciocínio Lógico");
  assert.equal(recovered.totalActiveSec, 3600);
  assert.equal(recovered.timeQuestionsSec, 3600);

  // Histórico também deve conter a sessão recuperada
  assert.ok(initial.historySessions.some((s) => s.id === 999 && s.status === "RECOVERED"));
});

test("Exportação e Importação de Backup JSON preservam histórico e matérias", () => {
  clearMemoryStoreForTesting();
  saveHistorySessions([
    {
      id: 501,
      studyDate: "2026-10-30",
      startTime: "2026-10-30T10:00:00.000Z",
      endTime: "2026-10-30T11:00:00.000Z",
      subject: "Direito Tributário",
      topic: "Impostos",
      timeReadingSec: 1800,
      timeMediaSec: 1800,
      timeReviewSec: 0,
      timeQuestionsSec: 0,
      timePausedSec: 0,
      totalActiveSec: 3600,
      status: "COMPLETED",
    },
  ]);

  const jsonBackup = exportDataAsJson();
  assert.match(jsonBackup, /"Direito Tributário"/);
  assert.match(jsonBackup, /"totalActiveSec": 3600/);

  // Limpa e restaura via import
  clearMemoryStoreForTesting();
  const success = importDataFromJson(jsonBackup);
  assert.equal(success, true);

  const initialAfterImport = getInitialDataWeb();
  assert.ok(initialAfterImport.historySessions.some((s) => s.subject === "Direito Tributário"));
});

test("App exibe botão de perfil de usuário e configuração de armazenamento no canto superior direito", () => {
  const appHtml = renderToStaticMarkup(React.createElement(App));
  assert.match(appHtml, /aria-label="Perfil do usuário e configurações de armazenamento"/);
  assert.match(appHtml, /Entrar/);
});

test("ControlBar em estado idle exibe botão 'Iniciar Estudo' habilitado quando onStartSession é fornecido", () => {
  const startControls = renderToStaticMarkup(
    React.createElement(ControlBar, {
      status: "idle",
      isBusy: false,
      onTogglePause: () => {},
      onStopSession: () => {},
      onStartSession: () => {},
    }),
  );
  assert.match(startControls, /Iniciar Estudo/);
  assert.match(startControls, /text-emerald-600/);
  // O botão de play/start não deve estar desabilitado
  assert.match(startControls, /<button[^>]*class="[^"]*cursor-pointer[^"]*">[\s\S]*?Iniciar Estudo/);
});

test("startOrSwitchModalityWeb com matéria em branco atribui 'Estudo Livre' para início imediato sem bloqueios", () => {
  clearMemoryStoreForTesting();
  const snap = startOrSwitchModalityWeb("reading", "   ", "");
  assert.equal(snap.status, "running");
  assert.equal(snap.activeModality, "reading");
  assert.equal(snap.subject, "Estudo Livre");
});

test("saveActiveSessionCheckpoint consolida fatias contínuas sem perder milissegundos acumulados", () => {
  clearMemoryStoreForTesting();
  const baseTime = Date.now() - 5000; // 5 segundos atrás

  saveActiveSession({
    id: 888,
    studyDate: "2026-10-30",
    startTime: new Date(baseTime).toISOString(),
    subject: "Direito Administrativo",
    topic: "Atos Administrativos",
    status: "running",
    activeModality: "reading",
    lastModality: "reading",
    sliceStartTime: baseTime,
    readingMs: 0,
    mediaMs: 0,
    reviewMs: 0,
    questionsMs: 0,
    pausedMs: 0,
    lastHeartbeat: baseTime,
  });

  // Executa checkpoint: consolida tempo decorrido no readingMs
  saveActiveSessionCheckpoint();

  const snap = computeSnapshot(null); // idle fallback
  assert.equal(snap.status, "idle");

  const initial = getInitialDataWeb();
  assert.equal(initial.recoveredSessions.length, 1);
  assert.equal(initial.recoveredSessions[0].subject, "Direito Administrativo");
  assert.ok(initial.recoveredSessions[0].totalActiveSec >= 4);
});

test("Cabeçalho padroniza altura h-8 para abas, tema e usuário, centraliza navegação e adota wordmark limpo sem relógio", () => {
  const appHtml = renderToStaticMarkup(React.createElement(App));

  // 1) Wordmark limpo: StudyChrono sem ícone de relógio no logo
  // Deve conter o título serifado mas NÃO deve ter svg antes dele dentro do bloco de marca
  assert.match(appHtml, /<div class="flex items-center"><h1[^>]*>StudyChrono<\/h1><\/div>/);

  // 2) Centralização absoluta (horizontal e vertical) do navegador de páginas
  assert.match(
    appHtml,
    /class="absolute left-1\/2 top-1\/2 -translate-x-1\/2 -translate-y-1\/2"><nav role="tablist"/,
  );

  // 3) Altura exata h-8 para todos os containers de botões do cabeçalho
  // Abas
  assert.match(appHtml, /<nav[^>]*role="tablist"[^>]*class="[^"]*\bh-8\b[^"]*"/);
  // Seletor de tema
  assert.match(appHtml, /<div[^>]*role="group"[^>]*class="[^"]*\bh-8\b[^"]*"/);
  // Container e Botão de usuário
  assert.match(appHtml, /<div class="relative flex items-center h-8">/);
  assert.match(
    appHtml,
    /<button[^>]*aria-label="Perfil do usuário e configurações de armazenamento"[^>]*class="[^"]*\bh-8\b[^"]*"/,
  );
  assert.match(appHtml, />Entrar<\/span>/);
});

test("UserMenuPopover renderiza resumo compacto de visitante e usuário autenticado, lista de 4 opções e logout", () => {
  // 1) Modo Visitante
  const guestMenuHtml = renderToStaticMarkup(
    React.createElement(UserMenuPopover, {
      isOpen: true,
      user: null,
      onClose: () => {},
      onOpenSection: () => {},
      onLoginDemo: () => {},
      onLogout: () => {},
    }),
  );
  assert.match(guestMenuHtml, /Modo Visitante/);
  assert.match(guestMenuHtml, /Dados salvos localmente neste navegador/);
  assert.match(guestMenuHtml, /Entrar com o Google/);
  assert.match(guestMenuHtml, /Perfil/);
  assert.match(guestMenuHtml, /Configuração \/ Armazenamento/);
  assert.match(guestMenuHtml, /Backup de Dados/);
  assert.match(guestMenuHtml, /Ajuda (&amp;|&) Sobre/);
  assert.doesNotMatch(guestMenuHtml, /Sair da Conta \(Logout\)/);

  // 2) Usuário Autenticado
  const userMenuHtml = renderToStaticMarkup(
    React.createElement(UserMenuPopover, {
      isOpen: true,
      user: {
        id: "demo_user_1",
        name: "Lucas Estudante",
        email: "lucas.estudante@studychrono.web",
        isDemo: true,
        provider: "demo",
        storageMode: "local",
      },
      onClose: () => {},
      onOpenSection: () => {},
      onLoginDemo: () => {},
      onLogout: () => {},
    }),
  );
  assert.match(userMenuHtml, /Lucas Estudante/);
  assert.match(userMenuHtml, /lucas\.estudante@studychrono\.web/);
  assert.match(userMenuHtml, /Demo/);
  assert.match(userMenuHtml, /Sair da Conta \(Logout\)/);
  assert.match(userMenuHtml, /Perfil/);
  assert.match(userMenuHtml, /Configuração \/ Armazenamento/);
  assert.match(userMenuHtml, /Backup de Dados/);
  assert.match(userMenuHtml, /Ajuda (&amp;|&) Sobre/);
});

test("UserProfileModal suporta seções individuais compactas e sóbrias (profile, storage, backup, help)", () => {
  const baseProps = {
    isOpen: true,
    user: null,
    storageMode: "local" as const,
    googleClientId: "",
    onClose: () => {},
    onLoginDemo: () => {},
    onLogout: () => {},
    onUpdateStorageMode: () => {},
    onUpdateGoogleClientId: () => {},
    onExportBackup: () => {},
    onImportBackup: async () => true,
  };

  // Seção: profile
  const profileHtml = renderToStaticMarkup(
    React.createElement(UserProfileModal, {
      ...baseProps,
      activeSection: "profile",
    }),
  );
  assert.match(profileHtml, /Perfil do Usuário/);
  assert.match(profileHtml, /Modo Visitante/);
  assert.doesNotMatch(profileHtml, /Armazenamento Local no Navegador/);
  assert.doesNotMatch(profileHtml, /Exportar Backup/);

  // Seção: storage
  const storageHtml = renderToStaticMarkup(
    React.createElement(UserProfileModal, {
      ...baseProps,
      activeSection: "storage",
    }),
  );
  assert.match(storageHtml, /Configuração de Armazenamento/);
  assert.match(storageHtml, /Armazenamento Local no Navegador/);
  assert.match(storageHtml, /Google Drive Pessoal/);
  assert.doesNotMatch(storageHtml, /Como Funciona o Fechamento Inesperado/);

  // Seção: backup
  const backupHtml = renderToStaticMarkup(
    React.createElement(UserProfileModal, {
      ...baseProps,
      activeSection: "backup",
    }),
  );
  assert.match(backupHtml, /Backup de Dados/);
  assert.match(backupHtml, /Exportar Backup \(JSON\)/);
  assert.match(backupHtml, /Importar Backup \(JSON\)/);
  assert.doesNotMatch(backupHtml, /Google OAuth Client ID/);

  // Seção: help
  const helpHtml = renderToStaticMarkup(
    React.createElement(UserProfileModal, {
      ...baseProps,
      activeSection: "help",
    }),
  );
  assert.match(helpHtml, /Ajuda (&amp;|&) Sobre/);
  assert.match(helpHtml, /Como Funciona o Fechamento Inesperado/);
  assert.match(helpHtml, /Atalhos &amp; Usabilidade|Atalhos & Usabilidade/);
  assert.doesNotMatch(helpHtml, /Google OAuth Client ID/);
  assert.doesNotMatch(helpHtml, /Exportar Backup/);
});

test("AuthService suporta autenticação oficial por conta Google e persistência", async () => {
  const { loginWithGoogleData } = await import(
    "../src/services/authService"
  );

  const googleUser = await loginWithGoogleData({
    id: "google_123456789",
    name: "Lucas Pedro",
    email: "lucas.pedro@gmail.com",
    avatarUrl: "https://lh3.googleusercontent.com/a/photo.jpg",
  });
  assert.equal(googleUser.name, "Lucas Pedro");
  assert.equal(googleUser.email, "lucas.pedro@gmail.com");
  assert.equal(googleUser.provider, "google");
  assert.equal(googleUser.storageMode, "drive");
  assert.equal(googleUser.isDemo, false);
});




