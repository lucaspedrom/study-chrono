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

// Hook de resolução e transpilação TypeScript sob demanda para os testes
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

const { IDLE_SNAPSHOT } = await import(
  pathToFileURL(path.join(rootDir, "src/types/session.ts")).href
);
const { TimerDisplay } = await import(
  pathToFileURL(path.join(rootDir, "src/components/TimerDisplay.tsx")).href
);
const { ControlBar } = await import(
  pathToFileURL(path.join(rootDir, "src/components/ControlBar.tsx")).href
);
const { HistoryReport } = await import(
  pathToFileURL(path.join(rootDir, "src/components/HistoryReport.tsx")).href
);
const { UserMenuPopover } = await import(
  pathToFileURL(path.join(rootDir, "src/components/UserMenuPopover.tsx")).href
);
const { default: App } = await import(
  pathToFileURL(path.join(rootDir, "src/App.tsx")).href
);

test("Responsividade 1: Barra Superior Móvel centraliza o wordmark StudyChrono e exibe botão de tema", () => {
  const appHtml = renderToStaticMarkup(React.createElement(App));

  // Wordmark 'StudyChrono' centralizado de forma absoluta em telas estreitas
  assert.match(
    appHtml,
    /class="absolute left-1\/2 top-1\/2 -translate-x-1\/2 -translate-y-1\/2 md:static md:translate-x-0 md:translate-y-0"[^>]*><div class="flex items-center"><h1[^>]*>StudyChrono<\/h1><\/div><\/div>/,
    "Wordmark StudyChrono deve estar centralizado em telas estreitas e ser estilizado com h1",
  );

  // Botão quadrado de alternância de tema padronizado em todas as telas (Sol / Lua)
  assert.match(
    appHtml,
    /<button[^>]*aria-label="Alternar para tema (Claro|Escuro)"[^>]*class="[^"]*h-8 w-8[^"]*"[^>]*>/i,
    "Deve conter o botão quadrado de alternância de tema (Sol/Lua) de h-8 w-8 padronizado em todas as telas",
  );

  // As abas centrais e botão de usuário na barra superior ficam restritos ao desktop (hidden no mobile)
  assert.match(
    appHtml,
    /<div class="hidden md:block">[^<]*<div class="absolute left-1\/2 top-1\/2 -translate-x-1\/2 -translate-y-1\/2"><nav role="tablist"/,
    "Abas da barra superior devem estar ocultas no mobile (hidden md:block)",
  );

  assert.match(
    appHtml,
    /<div class="hidden md:flex items-center gap-2">/,
    "Controles de desktop (tema duplo e perfil de cabeçalho) devem estar ocultos em telas estreitas (hidden md:flex)",
  );
});

test("Responsividade 2: Barra Inferior Fixa contém Cronômetro, Histórico e Acesso do Usuário", () => {
  const appHtml = renderToStaticMarkup(React.createElement(App));

  // Barra inferior móvel fixa
  assert.match(
    appHtml,
    /<nav[^>]*aria-label="Navegação inferior móvel"[^>]*class="[^"]*\bfixed\b[^"]*\bbottom-0\b[^"]*\bmd:hidden\b[^"]*"[^>]*>/,
    "A barra inferior deve ser fixa no rodapé (fixed bottom-0) e exclusiva para telas estreitas (md:hidden)",
  );

  // Aba 1: Cronômetro na barra inferior
  assert.match(
    appHtml,
    /<button[^>]*aria-label="Aba Cronômetro"[^>]*>/,
    "Barra inferior deve renderizar o botão da aba Cronômetro com aria-label descritivo",
  );
  assert.match(
    appHtml,
    /<button[^>]*aria-label="Aba Cronômetro"[^>]*>[\s\S]*?Cronômetro[\s\S]*?<\/button>/,
    "Barra inferior deve conter o texto Cronômetro",
  );

  // Aba 2: Histórico na barra inferior
  assert.match(
    appHtml,
    /<button[^>]*aria-label="Aba Histórico"[^>]*>/,
    "Barra inferior deve renderizar o botão da aba Histórico com aria-label descritivo",
  );
  assert.match(
    appHtml,
    /<button[^>]*aria-label="Aba Histórico"[^>]*>[\s\S]*?Histórico[\s\S]*?<\/button>/,
    "Barra inferior deve conter o texto Histórico",
  );

  // Item 3: Acesso a informações do usuário na barra inferior
  assert.match(
    appHtml,
    /<button[^>]*aria-label="Perfil do usuário e configurações de armazenamento \(móvel\)"[^>]*>/,
    "Barra inferior deve possuir botão para acesso a informações do usuário",
  );
});

test("Responsividade 3: Scroll da tela com barra fixa preserva visibilidade de todo o conteúdo (padding inferior de segurança)", () => {
  const appHtml = renderToStaticMarkup(React.createElement(App));

  // Área principal <main> possui padding inferior generoso no mobile (pb-20) revertido no desktop (md:pb-3)
  assert.match(
    appHtml,
    /<main[^>]*class="[^"]*\bpb-20\b[^"]*\bmd:pb-3\b[^"]*"[^>]*>/,
    "O container <main> deve possuir pb-20 no mobile para permitir rolagem total sem que a barra inferior cubra os botões",
  );

  // O container do cronômetro possui overflow-y-auto para rolagem independente
  assert.match(
    appHtml,
    /<div class="flex flex-1 min-h-0 overflow-y-auto">/,
    "O conteúdo do cronômetro deve possuir overflow-y-auto para rolagem suave",
  );
});

test("Responsividade 4: UserMenuPopover suporta ancoragem móvel (placement='bottom') sem corte de tela", () => {
  const mobilePopoverHtml = renderToStaticMarkup(
    React.createElement(UserMenuPopover, {
      isOpen: true,
      placement: "bottom",
      user: {
        id: "usr_1",
        name: "Lucas Teste",
        email: "lucas@estudante.com",
        isDemo: true,
        provider: "demo",
        storageMode: "local",
      },
      onClose: () => {},
      onOpenSection: () => {},
      onLogout: () => {},
    }),
  );

  // Popover ancorado no rodapé: fixed bottom-18, com margens laterais que impedem overflow em celulares estreitos
  assert.match(
    mobilePopoverHtml,
    /class="[^"]*\bfixed\b[^"]*\bbottom-18\b[^"]*\bright-3\b[^"]*\bleft-3\b[^"]*"/,
    "UserMenuPopover com placement='bottom' deve ficar posicionado acima da barra fixa com right-3 e left-3 para não vazar",
  );

  // Resumo do usuário e opções
  assert.match(mobilePopoverHtml, /Lucas Teste/);
  assert.match(mobilePopoverHtml, /Perfil/);
  assert.match(mobilePopoverHtml, /Configuração \/ Armazenamento/);
  assert.match(mobilePopoverHtml, /Backup de Dados/);
  assert.match(mobilePopoverHtml, /Ajuda (&amp;|&) Sobre/);
  assert.match(mobilePopoverHtml, /Sair da Conta \(Logout\)/);

  // Backdrop touch para fechar ao tocar fora
  assert.match(
    mobilePopoverHtml,
    /<div[^>]*role="presentation"[^>]*class="fixed inset-0 z-30 cursor-default bg-black\/25 md:bg-transparent"/,
    "Deve renderizar backdrop para fechar ao clicar/tocar fora",
  );
});

test("Responsividade 5: Dimensionamento e usabilidade de TimerDisplay, ControlBar e HistoryReport em telas estreitas", () => {
  // 1) TimerDisplay com tipografia fluida que não transborda 320px
  const timerHtml = renderToStaticMarkup(
    React.createElement(TimerDisplay, {
      snapshot: {
        ...IDLE_SNAPSHOT,
        status: "running",
        activeModality: "reading",
        totalActiveSec: 3661,
        totalActiveMs: 3661200,
      },
    }),
  );
  assert.match(
    timerHtml,
    /text-5xl min-\[380px\]:text-6xl sm:text-7xl/,
    "Relógio principal deve usar text-5xl em telas estreitas (<380px) e escalar responsivamente",
  );
  assert.match(
    timerHtml,
    /text-xl min-\[380px\]:text-2xl sm:text-3xl/,
    "Décimos de segundo devem usar text-xl em telas estreitas (<380px)",
  );

  // 2) ControlBar com botões adaptados para toque (flex-1 sm:flex-initial e truncate)
  const controlHtml = renderToStaticMarkup(
    React.createElement(ControlBar, {
      status: "running",
      isBusy: false,
      onTogglePause: () => {},
      onStopSession: () => {},
    }),
  );
  assert.match(
    controlHtml,
    /flex-1 sm:flex-initial/,
    "Botões de controle devem preencher a largura no mobile (flex-1) para facilitar toque touch",
  );
  assert.match(
    controlHtml,
    /<span class="truncate">Pausar Sessão<\/span>/,
    "Texto do botão deve usar truncate para evitar quebras em telas estreitas",
  );

  // 3) HistoryReport com metodologia otimizada para mobile:
  // - Oculta Tópico e modalidades individuais da tabela em telas estreitas (hidden md:table-cell)
  // - Mantém apenas Data/Horário, Matéria e Total
  // - Reduz botões Editar e Excluir a ícones no mobile
  // - Inclui botão de detalhes (ícone Eye)
  const historyHtml = renderToStaticMarkup(
    React.createElement(HistoryReport, {
      sessions: [
        {
          id: 1,
          studyDate: "2026-10-31",
          startTime: "2026-10-31T10:00:00-03:00",
          endTime: "2026-10-31T11:00:00-03:00",
          subject: "Constitucional",
          topic: "Direitos Fundamentais",
          timeReadingSec: 3600,
          timeMediaSec: 1200,
          timeReviewSec: 600,
          timeQuestionsSec: 900,
          timePausedSec: 300,
          totalActiveSec: 6300,
          status: "CLOSED",
        },
      ],
      subjects: ["Constitucional"],
      onEditSession: async () => {},
      onDeleteSession: async () => {},
    }),
  );

  // Colunas secundárias ocultas no mobile (hidden md:table-cell)
  assert.match(
    historyHtml,
    /<th[^>]*class="[^"]*hidden md:table-cell[^"]*"[^>]*>[\s\S]*?Tópico[\s\S]*?<\/th>/,
    "Coluna Tópico deve estar oculta no mobile (hidden md:table-cell)",
  );
  assert.match(
    historyHtml,
    /<th[^>]*class="[^"]*hidden md:table-cell[^"]*"[^>]*>[\s\S]*?Leit\.[\s\S]*?<\/th>/,
    "Coluna Leitura deve estar oculta no mobile (hidden md:table-cell)",
  );

  // Botões de ação no mobile: Editar e Excluir apenas ícone no mobile (texto hidden md:inline)
  assert.match(
    historyHtml,
    /<span class="hidden md:inline">Editar<\/span>/,
    "Botão Editar deve exibir apenas ícone no mobile e texto oculto com hidden md:inline",
  );
  assert.match(
    historyHtml,
    /<span class="hidden md:inline">Excluir<\/span>/,
    "Botão Excluir deve exibir apenas ícone no mobile e texto oculto com hidden md:inline",
  );

  // Botão de Detalhes incluído com ícone Eye restrito ao mobile (md:hidden)
  assert.match(
    historyHtml,
    /<button[^>]*aria-label="Ver detalhes do registro de Constitucional"[^>]*title="Ver detalhes completos"[^>]*class="[^"]*\bmd:hidden\b[^"]*"/,
    "Linha deve conter o botão de visualizar detalhes com ícone Eye restrito a telas móveis (md:hidden)",
  );

  // Nomes exatos das colunas da tabela: Data | Matéria | Tempo | Ações
  assert.match(
    historyHtml,
    /<th[^>]*>\s*Data\s*<\/th>/,
    "Cabeçalho deve conter a coluna 'Data'",
  );
  assert.match(
    historyHtml,
    /<th[^>]*>\s*Matéria\s*<\/th>/,
    "Cabeçalho deve conter a coluna 'Matéria'",
  );
  assert.match(
    historyHtml,
    /<th[^>]*>\s*Tempo\s*<\/th>/,
    "Cabeçalho deve conter a coluna 'Tempo'",
  );
  assert.match(
    historyHtml,
    /<th[^>]*>\s*Ações\s*<\/th>/,
    "Cabeçalho deve conter a coluna 'Ações'",
  );

  // Padding de resguardo na coluna de ações para garantir margem direita generosa dos botões de ação
  assert.match(
    historyHtml,
    /<th[^>]*class="[^"]*\b(pr-4|md:pr-6)\b[^"]*"[^>]*>\s*Ações\s*<\/th>/,
    "Coluna de ações deve possuir padding lateral direito para margem de resguardo dos botões",
  );

  // Seta do filtro de matérias com padding e centralização para não encostar na borda
  assert.match(
    historyHtml,
    /<select[^>]*id="history-subject-filter"[^>]*class="[^"]*\bappearance-none\b[^"]*\bpr-9\b[^"]*"/,
    "Select de filtro de matérias deve usar appearance-none e pr-9 para acomodar o chevron",
  );
  assert.match(
    historyHtml,
    /<div[^>]*class="[^"]*\bpr-3\b[^"]*"[^>]*><svg[^>]*class="[^"]*lucide-chevron-down[^"]*"/,
    "Ícone de chevron do filtro deve possuir padding pr-3 para resguardo visual",
  );

  assert.match(
    historyHtml,
    /grid-cols-2 sm:grid-cols-3 md:grid-cols-6/,
    "Resumo de totais deve usar 2 colunas no mobile e até 6 colunas no desktop",
  );

  // 4) Caixa flutuante de detalhes: abre exibindo as informações completas que foram ocultadas
  const detailsHtml = renderToStaticMarkup(
    React.createElement(HistoryReport, {
      sessions: [
        {
          id: 1,
          studyDate: "2026-10-31",
          startTime: "2026-10-31T10:00:00-03:00",
          endTime: "2026-10-31T11:45:00-03:00",
          subject: "Direito Constitucional",
          topic: "Direitos Fundamentais e Garantias",
          timeReadingSec: 3600,
          timeMediaSec: 1200,
          timeReviewSec: 600,
          timeQuestionsSec: 900,
          timePausedSec: 300,
          totalActiveSec: 6300,
          status: "RECOVERED",
        },
      ],
      subjects: ["Direito Constitucional"],
      initialDetailsSession: {
        id: 1,
        studyDate: "2026-10-31",
        startTime: "2026-10-31T10:00:00-03:00",
        endTime: "2026-10-31T11:45:00-03:00",
        subject: "Direito Constitucional",
        topic: "Direitos Fundamentais e Garantias",
        timeReadingSec: 3600,
        timeMediaSec: 1200,
        timeReviewSec: 600,
        timeQuestionsSec: 900,
        timePausedSec: 300,
        totalActiveSec: 6300,
        status: "RECOVERED",
      },
      onEditSession: async () => {},
      onDeleteSession: async () => {},
    }),
  );

  assert.match(
    detailsHtml,
    /role="dialog"[^>]*aria-labelledby="session-details-modal-title"/,
    "Caixa flutuante de detalhes deve ser renderizada como diálogo acessível",
  );
  assert.match(detailsHtml, /Detalhes do Estudo/);
  assert.match(detailsHtml, /Direitos Fundamentais e Garantias/);
  assert.match(detailsHtml, /Recuperada/);
  assert.match(detailsHtml, /Tempo Líquido Total/);
  assert.match(detailsHtml, /Tempo por Modalidade/);
  assert.match(detailsHtml, /Leitura/);
  assert.match(detailsHtml, /Videoaula/);
  assert.match(detailsHtml, /Revisão/);
  assert.match(detailsHtml, /Questões/);
  assert.match(detailsHtml, /Intervalos \/ Pausas/);
});
