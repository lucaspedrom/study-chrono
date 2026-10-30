import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const exePath = path.join(
  rootDir,
  "src-tauri",
  "target",
  "release",
  process.platform === "win32" ? "study-chrono.exe" : "study-chrono",
);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class CdpClient {
  private ws: WebSocket;
  private nextId = 1;
  private pending = new Map<
    number,
    { resolve: (val: any) => void; reject: (err: Error) => void }
  >();

  private constructor(ws: WebSocket) {
    this.ws = ws;
    this.ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(String(ev.data));
      if (typeof msg.id === "number" && this.pending.has(msg.id)) {
        const entry = this.pending.get(msg.id)!;
        this.pending.delete(msg.id);
        if (msg.error) {
          entry.reject(
            new Error(msg.error.message || JSON.stringify(msg.error)),
          );
        } else {
          entry.resolve(msg.result);
        }
      }
    });
  }

  static async connect(port: number, timeoutMs = 10000): Promise<CdpClient> {
    const deadline = Date.now() + timeoutMs;
    let wsUrl: string | null = null;

    while (Date.now() < deadline) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/json`);
        if (res.ok) {
          const targets = (await res.json()) as Array<{
            type: string;
            title: string;
            webSocketDebuggerUrl?: string;
          }>;
          const page = targets.find(
            (t) => t.type === "page" && t.webSocketDebuggerUrl,
          );
          if (page?.webSocketDebuggerUrl) {
            wsUrl = page.webSocketDebuggerUrl;
            break;
          }
        }
      } catch {
        // Aguarda inicialização do WebView2
      }
      await sleep(200);
    }

    assert.ok(wsUrl, `Não foi possível conectar ao WebView2 CDP na porta ${port}`);

    const ws = new WebSocket(wsUrl);
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener("open", () => resolve(), { once: true });
      ws.addEventListener("error", (e) => reject(new Error(String(e))), {
        once: true,
      });
    });

    const client = new CdpClient(ws);
    await client.send("Runtime.enable");
    return client;
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<any> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval<T = any>(expression: string): Promise<T> {
    const res = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error(
        `JS exception: ${JSON.stringify(res.exceptionDetails.exception)}`,
      );
    }
    return res.result?.value as T;
  }

  async clickSelector(selector: string): Promise<void> {
    const pt = await this.eval<{ x: number; y: number } | null>(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    assert.ok(pt, `Elemento não encontrado para clique: ${selector}`);
    await this.clickAt(pt.x, pt.y);
  }

  async clickButtonByText(textSubstring: string): Promise<void> {
    const pt = await this.eval<{ x: number; y: number } | null>(`(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const btn = buttons.find((b) => (b.textContent || "").includes(${JSON.stringify(textSubstring)}));
      if (!btn) return null;
      const r = btn.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    assert.ok(pt, `Botão não encontrado com texto: ${textSubstring}`);
    await this.clickAt(pt.x, pt.y);
  }

  async clickAt(x: number, y: number): Promise<void> {
    await this.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x,
      y,
      button: "left",
      clickCount: 1,
    });
    await this.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x,
      y,
      button: "left",
      clickCount: 1,
    });
  }

  async setInputValue(selector: string, value: string): Promise<void> {
    await this.clickSelector(selector);
    await this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) throw new Error("Input missing");
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event("input", { bubbles: true }));
    })()`);
  }

  async pressKey(
    key: string,
    code: string,
    windowsVirtualKeyCode: number,
  ): Promise<void> {
    await this.send("Input.dispatchKeyEvent", {
      type: "rawKeyDown",
      key,
      code,
      windowsVirtualKeyCode,
      nativeVirtualKeyCode: windowsVirtualKeyCode,
    });
    await this.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key,
      code,
      windowsVirtualKeyCode,
      nativeVirtualKeyCode: windowsVirtualKeyCode,
    });
  }

  close(): void {
    try {
      this.ws.close();
    } catch {
      // Ignora erro no encerramento
    }
  }
}

function sendWin32CloseToProcess(pid: number): void {
  const psScript = `
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class Win32CloseHelper {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder strText, int maxCount);
    [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
}
"@
$found = [IntPtr]::Zero
[Win32CloseHelper]::EnumWindows({
    param($hWnd, $lParam)
    $wPid = 0
    [Win32CloseHelper]::GetWindowThreadProcessId($hWnd, [ref]$wPid) | Out-Null
    if ($wPid -eq ${pid}) {
        $sb = New-Object System.Text.StringBuilder 256
        [Win32CloseHelper]::GetWindowText($hWnd, $sb, 256) | Out-Null
        if ($sb.ToString() -eq "StudyChrono") {
            $script:found = $hWnd
            return $false
        }
    }
    return $true
}, [IntPtr]::Zero) | Out-Null
if ($found -eq [IntPtr]::Zero) { throw "Janela StudyChrono não localizada para PID ${pid}" }
[Win32CloseHelper]::PostMessage($found, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
`;
  execFileSync("powershell", ["-NoProfile", "-Command", psScript], {
    stdio: "pipe",
  });
}

function resizeProcessWindow(pid: number, width: number, height: number): void {
  const psScript = `
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class Win32ResizeHelper {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder strText, int maxCount);
    [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr hWnd, int X, int Y, int nWidth, int nHeight, bool bRepaint);
}
"@
$found = [IntPtr]::Zero
[Win32ResizeHelper]::EnumWindows({
    param($hWnd, $lParam)
    $wPid = 0
    [Win32ResizeHelper]::GetWindowThreadProcessId($hWnd, [ref]$wPid) | Out-Null
    if ($wPid -eq ${pid}) {
        $sb = New-Object System.Text.StringBuilder 256
        [Win32ResizeHelper]::GetWindowText($hWnd, $sb, 256) | Out-Null
        if ($sb.ToString() -eq "StudyChrono") {
            $script:found = $hWnd
            return $false
        }
    }
    return $true
}, [IntPtr]::Zero) | Out-Null
if ($found -eq [IntPtr]::Zero) { throw "Janela StudyChrono não localizada para PID ${pid}" }
[Win32ResizeHelper]::MoveWindow($found, 60, 60, ${width}, ${height}, $true) | Out-Null
`;
  execFileSync("powershell", ["-NoProfile", "-Command", psScript], {
    stdio: "pipe",
  });
}

async function waitForCondition(
  fn: () => Promise<boolean>,
  timeoutMs = 5000,
  label = "condição",
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await fn()) return;
    await sleep(100);
  }
  throw new Error(`Timeout aguardando: ${label}`);
}

const AUDIT_MONOCHROME_EXPR = `(() => {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const checkColor = (cssColor) => {
    if (!cssColor || cssColor === "transparent" || cssColor === "rgba(0, 0, 0, 0)") return true;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "#000000";
    ctx.fillStyle = cssColor;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    if (a === 0) return true;
    return Math.abs(r - g) <= 2 && Math.abs(g - b) <= 2 && Math.abs(r - b) <= 2;
  };
  const isAllowedColoredControlIcon = (el) => {
    const svg = el instanceof SVGElement ? el.closest("svg") : null;
    if (!svg) return false;
    const btn = svg.closest("button");
    if (!btn) return false;
    const label = btn.textContent || "";
    return (
      label.includes("Pausar Sessão") ||
      label.includes("Retomar Sessão") ||
      label.includes("Finalizar Estudo")
    );
  };
  const elements = Array.from(document.querySelectorAll("*")).filter(
    (el) => !isAllowedColoredControlIcon(el),
  );
  for (const el of elements) {
    const cs = window.getComputedStyle(el);
    for (const prop of [
      "color",
      "backgroundColor",
      "borderTopColor",
      "borderRightColor",
      "borderBottomColor",
      "borderLeftColor",
      "outlineColor",
    ]) {
      if (!checkColor(cs[prop])) {
        return { ok: false, tag: el.tagName, cls: String(el.className), prop, val: cs[prop] };
      }
    }
  }
  return { ok: true };
})()`;

test(
  "E2E Binário Nativo + WebView2: Décimos, Sistema Tipográfico (Romana-Book + Akkurat-Mono + AkkuratPro-Regular), Paleta Monocromática, Tema Claro/Escuro, Histórico CRUD e RN01–RN05",
  { skip: process.platform !== "win32" || !fs.existsSync(exePath) },
  async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "studychrono-e2e-"));
    const dataDir = path.join(tempRoot, "data");
    const wv2Dir = path.join(tempRoot, "webview2");
    fs.mkdirSync(dataDir, { recursive: true });
    fs.mkdirSync(wv2Dir, { recursive: true });

    const cdpPort1 = 19400 + Math.floor(Math.random() * 400);
    let proc: ChildProcess | null = null;
    let cdp: CdpClient | null = null;

    const spawnBinary = (port: number) =>
      spawn(exePath, [], {
        env: {
          ...process.env,
          STUDY_CHRONO_DATA_DIR: dataDir,
          WEBVIEW2_USER_DATA_FOLDER: wv2Dir,
          WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
        },
        stdio: "ignore",
      });

    try {
      // =========================================================================
      // EXECUÇÃO 1: Tipografia, Temas, Décimos, Abas, Histórico CRUD + RN01–RN04
      // =========================================================================
      proc = spawnBinary(cdpPort1);
      cdp = await CdpClient.connect(cdpPort1);

      await waitForCondition(
        async () =>
          cdp!.eval<boolean>(
            `(document.body?.textContent || "").includes("Tempo Líquido de Estudo")`,
          ),
        8000,
        "renderização inicial do App",
      );

      // 1) Verifica Tela do Cronômetro 100% limpa, carregamento offline das 3 famílias tipográficas,
      //    dígitos tabulares fixos e ausência de truncamento nas modalidades mesmo em 760px
      const typographyAndCleanCheck = await cdp.eval<{
        romanaLoaded: boolean;
        akkuratMonoLoaded: boolean;
        akkuratProLoaded: boolean;
        brandHeadingFont: string;
        timerHeadingFont: string;
        bodyFont: string;
        inputFont: string;
        labelFont: string;
        tabFont: string;
        clockFont: string;
        widthDiff: number;
        tenthsSpread: number;
        truncatedModalitiesAt760: string[];
        hasHistoryOnTimerTab: boolean;
      }>(`(async () => {
        await document.fonts.ready;
        // Dispara carregamento dos faces sob demanda verificando caracteres latinos e acentuados
        await Promise.all([
          document.fonts.load('400 22px "Romana-Book"', "Tempo Líquido"),
          document.fonts.load('500 12px "Akkurat-Mono"', "00:00:00.0 CRONÔMETRO"),
          document.fonts.load('400 14px "AkkuratPro-Regular"', "Direito Constitucional"),
        ]);

        const romanaLoaded = document.fonts.check('400 22px "Romana-Book"', "Tempo Líquido");
        const akkuratMonoLoaded = document.fonts.check('500 12px "Akkurat-Mono"', "00:00:00.0");
        const akkuratProLoaded = document.fonts.check('400 14px "AkkuratPro-Regular"', "Direito");

        const brandHeadingFont = getComputedStyle(document.querySelector("header h1")).fontFamily;
        const timerHeadingFont = getComputedStyle(document.querySelector("main h2")).fontFamily;
        const bodyFont = getComputedStyle(document.body).fontFamily;
        const inputFont = getComputedStyle(document.querySelector("#subject-input")).fontFamily;
        const labelFont = getComputedStyle(document.querySelector('label[for="subject-input"]')).fontFamily;
        const tabFont = getComputedStyle(document.querySelector('button[role="tab"]')).fontFamily;
        const clockEl = document.querySelector("#main-timer-clock");
        const clockFont = getComputedStyle(clockEl).fontFamily;

        const probe = document.createElement("span");
        probe.className = "tabular-clock font-mono text-6xl font-normal tabular-nums";
        probe.style.position = "fixed";
        probe.style.visibility = "hidden";
        document.body.appendChild(probe);
        probe.textContent = "11:11:11.1";
        const w1 = probe.getBoundingClientRect().width;
        probe.textContent = "88:88:88.8";
        const w8 = probe.getBoundingClientRect().width;
        probe.remove();

        const clockClone = clockEl.cloneNode(true);
        clockClone.removeAttribute("id");
        clockClone.style.position = "fixed";
        clockClone.style.visibility = "hidden";
        document.body.appendChild(clockClone);
        const cloneTenthsEl = clockClone.querySelector('[data-testid="timer-tenths"]');
        const clockWidths = [];
        for (let d = 0; d <= 9; d++) {
          cloneTenthsEl.textContent = "." + d;
          clockWidths.push(clockClone.getBoundingClientRect().width);
        }
        clockClone.remove();
        const tenthsSpread = Math.max(...clockWidths) - Math.min(...clockWidths);

        // Simula largura mínima da janela (760px - 40px padding de <main> = 720px) para garantir zero truncamento
        const mainEl = document.querySelector("main");
        const prevWidth = mainEl.style.width;
        mainEl.style.width = "760px";
        const modalityLabelSpans = Array.from(document.querySelectorAll("button span.truncate"));
        const truncatedModalitiesAt760 = modalityLabelSpans
          .filter((s) => s.scrollWidth > s.clientWidth + 1)
          .map((s) => s.textContent || "");
        mainEl.style.width = prevWidth;

        const txt = document.body?.textContent || "";
        const hasHistoryOnTimerTab =
          txt.includes("Histórico de Hoje") ||
          txt.includes("Relatório de Estudos Realizados");

        return {
          romanaLoaded,
          akkuratMonoLoaded,
          akkuratProLoaded,
          brandHeadingFont,
          timerHeadingFont,
          bodyFont,
          inputFont,
          labelFont,
          tabFont,
          clockFont,
          widthDiff: Math.abs(w1 - w8),
          tenthsSpread,
          truncatedModalitiesAt760,
          hasHistoryOnTimerTab,
        };
      })()`);

      assert.equal(typographyAndCleanCheck.romanaLoaded, true, "Fonte Romana-Book deve carregar via @font-face");
      assert.equal(typographyAndCleanCheck.akkuratMonoLoaded, true, "Fonte Akkurat-Mono deve carregar via @font-face");
      assert.equal(typographyAndCleanCheck.akkuratProLoaded, true, "Fonte AkkuratPro-Regular deve carregar via @font-face");
      assert.match(typographyAndCleanCheck.brandHeadingFont, /Romana-Book/i);
      assert.match(typographyAndCleanCheck.brandHeadingFont, /Times New Roman/i);
      assert.match(typographyAndCleanCheck.timerHeadingFont, /Romana-Book/i);
      assert.match(typographyAndCleanCheck.bodyFont, /AkkuratPro-Regular/i);
      assert.doesNotMatch(typographyAndCleanCheck.bodyFont, /Times New Roman/i);
      assert.match(typographyAndCleanCheck.inputFont, /AkkuratPro-Regular/i);
      assert.match(typographyAndCleanCheck.labelFont, /Akkurat-Mono/i);
      assert.match(typographyAndCleanCheck.labelFont, /Andale Mono/i);
      assert.match(typographyAndCleanCheck.tabFont, /Akkurat-Mono/i);
      assert.match(typographyAndCleanCheck.clockFont, /Akkurat-Mono/i);
      assert.ok(
        typographyAndCleanCheck.widthDiff < 0.5,
        `Dígitos no relógio devem ter largura tabular fixa (diff=${typographyAndCleanCheck.widthDiff})`,
      );
      assert.ok(
        typographyAndCleanCheck.tenthsSpread < 0.5,
        `Visor principal não deve oscilar horizontalmente entre .0 e .9 (spread=${typographyAndCleanCheck.tenthsSpread})`,
      );
      assert.deepEqual(
        typographyAndCleanCheck.truncatedModalitiesAt760,
        [],
        `Nenhum rótulo de modalidade deve truncar em 760px: ${typographyAndCleanCheck.truncatedModalitiesAt760.join(", ")}`,
      );
      assert.equal(
        typographyAndCleanCheck.hasHistoryOnTimerTab,
        false,
        "Aba Cronômetro deve ser 100% limpa sem histórico ou resumo",
      );

      // Verifica diferenciação real de peso tipográfico (400 vs 600/700) e redimensionamento Win32 mínimo (760x640) no Cronômetro
      const weightDiffCheck = await cdp.eval<{
        sansInk400: number;
        sansInk600: number;
        monoInk400: number;
        monoInk600: number;
      }>(`(() => {
        const measureInk = (spec, text) => {
          const c = document.createElement("canvas");
          c.width = 360;
          c.height = 64;
          const ctx = c.getContext("2d");
          ctx.font = spec;
          ctx.fillStyle = "#000000";
          ctx.fillText(text, 8, 44);
          const data = ctx.getImageData(0, 0, 360, 64).data;
          let sum = 0;
          for (let i = 3; i < data.length; i += 4) sum += data[i];
          return sum;
        };
        return {
          sansInk400: measureInk('400 28px "AkkuratPro-Regular"', "Direito Constitucional"),
          sansInk600: measureInk('600 28px "AkkuratPro-Regular"', "Direito Constitucional"),
          monoInk400: measureInk('400 28px "Akkurat-Mono"', "01:42:18 FINALIZAR"),
          monoInk600: measureInk('600 28px "Akkurat-Mono"', "01:42:18 FINALIZAR"),
        };
      })()`);
      assert.ok(
        weightDiffCheck.sansInk600 > weightDiffCheck.sansInk400 * 1.08,
        `AkkuratPro-Regular deve diferenciar peso 600 de 400 (${weightDiffCheck.sansInk600} vs ${weightDiffCheck.sansInk400})`,
      );
      assert.ok(
        weightDiffCheck.monoInk600 > weightDiffCheck.monoInk400 * 1.08,
        `Akkurat-Mono deve diferenciar peso 600 de 400 (${weightDiffCheck.monoInk600} vs ${weightDiffCheck.monoInk400})`,
      );

      resizeProcessWindow(proc.pid!, 760, 640);
      await sleep(250);
      const minWindowTimerCheck = await cdp.eval<{
        scrollH: number;
        clientH: number;
        stopBtnBottom: number;
        innerH: number;
        truncatedAtReal760: string[];
      }>(`(() => {
        const scrollBox = document.querySelector("main > div");
        const stopBtn = Array.from(document.querySelectorAll("button")).find((b) =>
          (b.textContent || "").includes("Finalizar Estudo"),
        );
        const truncatedAtReal760 = Array.from(document.querySelectorAll("button span.truncate"))
          .filter((s) => s.scrollWidth > s.clientWidth + 1)
          .map((s) => s.textContent || "");
        return {
          scrollH: scrollBox.scrollHeight,
          clientH: scrollBox.clientHeight,
          stopBtnBottom: stopBtn.getBoundingClientRect().bottom,
          innerH: window.innerHeight,
          truncatedAtReal760,
        };
      })()`);
      assert.ok(
        minWindowTimerCheck.scrollH <= minWindowTimerCheck.clientH + 1 &&
          minWindowTimerCheck.stopBtnBottom <= minWindowTimerCheck.innerH,
        `Na janela mínima 760x640, a aba Cronômetro deve caber inteira sem cortar controles (scrollH=${minWindowTimerCheck.scrollH}, clientH=${minWindowTimerCheck.clientH}, stopBottom=${minWindowTimerCheck.stopBtnBottom}, innerH=${minWindowTimerCheck.innerH})`,
      );
      assert.deepEqual(
        minWindowTimerCheck.truncatedAtReal760,
        [],
        `Nenhum card de modalidade deve truncar na janela Win32 mínima 760x640: ${minWindowTimerCheck.truncatedAtReal760.join(", ")}`,
      );
      resizeProcessWindow(proc.pid!, 900, 720);
      await sleep(200);

      // 2) Auditoria de paleta monocromática em Modo Escuro (incluindo foco por Tab) e alternância para Modo Claro
      assert.equal(
        await cdp.eval<boolean>(`document.documentElement.classList.contains("dark")`),
        true,
      );
      await cdp.pressKey("Tab", "Tab", 9);
      const darkMonoAudit = await cdp.eval<{ ok: boolean; [k: string]: any }>(
        AUDIT_MONOCHROME_EXPR,
      );
      assert.equal(
        darkMonoAudit.ok,
        true,
        `Violação monocromática no tema escuro: ${JSON.stringify(darkMonoAudit)}`,
      );

      const themeGroupHeightBefore = await cdp.eval<number>(
        `document.querySelector('[aria-label="Tema de aparência"]').getBoundingClientRect().height`,
      );
      await cdp.clickButtonByText("Claro");
      await waitForCondition(
        async () =>
          cdp!.eval<boolean>(
            `!document.documentElement.classList.contains("dark") && localStorage.getItem("study_chrono_theme") === "light"`,
          ),
        2000,
        "alternância para o tema Claro",
      );
      const themeGroupHeightAfter = await cdp.eval<number>(
        `document.querySelector('[aria-label="Tema de aparência"]').getBoundingClientRect().height`,
      );
      assert.ok(
        Math.abs(themeGroupHeightBefore - themeGroupHeightAfter) < 0.5,
        "Alternar entre Claro e Escuro não deve alterar a altura do grupo de botões",
      );
      await cdp.pressKey("Tab", "Tab", 9);
      const lightMonoAudit = await cdp.eval<{ ok: boolean; [k: string]: any }>(
        AUDIT_MONOCHROME_EXPR,
      );
      assert.equal(
        lightMonoAudit.ok,
        true,
        `Violação monocromática no tema claro: ${JSON.stringify(lightMonoAudit)}`,
      );

      // 3) RN01: Clicar em modalidade com Matéria vazia exibe erro e foca o input
      await cdp.clickButtonByText("Leitura");
      await waitForCondition(
        async () =>
          cdp!.eval<boolean>(
            `(document.body?.textContent || "").includes("Informe a matéria para iniciar o cronômetro.") && document.activeElement?.id === "subject-input"`,
          ),
        3000,
        "validação de matéria vazia em RN01",
      );

      // 4) Inicia em Leitura e valida contagem real dos décimos de segundo (.0 a .9)
      await cdp.setInputValue("#subject-input", "  Português  ");
      await cdp.setInputValue("#topic-input", "Crase");
      await cdp.clickButtonByText("Leitura");

      await waitForCondition(
        async () =>
          cdp!.eval<boolean>(
            `(document.body?.textContent || "").includes("EM ANDAMENTO")`,
          ),
        3000,
        "transição para EM ANDAMENTO",
      );

      const observedTenths = new Set<string>();
      for (let i = 0; i < 12; i++) {
        const val = await cdp.eval<string>(
          `document.querySelector('[data-testid="timer-tenths"]')?.textContent || ""`,
        );
        assert.match(val, /^\.[0-9]$/, `Formato inválido de décimos: ${val}`);
        observedTenths.add(val);
        await sleep(65);
      }
      assert.ok(
        observedTenths.size >= 3,
        `Décimos de segundo devem avançar dinamicamente no visor principal (observados: ${Array.from(observedTenths).join(", ")})`,
      );

      // Navega até a aba Histórico com sessão em andamento e retorna sem interromper contagem
      await cdp.clickSelector('button[role="tab"]:nth-of-type(2)');
      await waitForCondition(
        async () =>
          cdp!.eval<boolean>(
            `(document.body?.textContent || "").includes("Relatório de Estudos Realizados")`,
          ),
        2000,
        "abertura da aba Histórico durante sessão ativa",
      );
      await cdp.clickSelector('button[role="tab"]:nth-of-type(1)');
      await waitForCondition(
        async () =>
          cdp!.eval<boolean>(
            `(document.body?.textContent || "").includes("EM ANDAMENTO")`,
          ),
        2000,
        "retorno à aba Cronômetro com sessão preservada",
      );

      // 5) RN03 Hot-Swap: Alterna para Questões, Pausa e retoma direto em Revisão
      await cdp.clickButtonByText("Questões");
      await sleep(550);

      await cdp.clickButtonByText("Pausar Sessão");
      await waitForCondition(
        async () =>
          cdp!.eval<boolean>(
            `(document.body?.textContent || "").includes("PAUSADO")`,
          ),
        3000,
        "estado PAUSADO",
      );
      await sleep(500);
      await cdp.clickButtonByText("Revisão");
      await waitForCondition(
        async () =>
          cdp!.eval<boolean>(
            `(document.body?.textContent || "").includes("EM ANDAMENTO") && (document.body?.textContent || "").includes("Revisão")`,
          ),
        3000,
        "retomada direta em Revisão",
      );

      // 6) Limpar Matéria e tentar "Finalizar Estudo" deve bloquear sem perder tópico
      await cdp.setInputValue("#subject-input", "   ");
      await cdp.setInputValue("#topic-input", "Concordância Nominal");
      await cdp.clickButtonByText("Finalizar Estudo");
      await waitForCondition(
        async () =>
          cdp!.eval<boolean>(
            `(document.body?.textContent || "").includes("Informe a matéria antes de finalizar o estudo.")`,
          ),
        3000,
        "bloqueio de finalização com matéria vazia",
      );

      // Restaura Matéria, edita Tópico e finaliza imediatamente
      await cdp.setInputValue("#subject-input", "Português");
      await cdp.setInputValue("#topic-input", "Concordância Verbal e Nominal");
      await cdp.clickButtonByText("Finalizar Estudo");

      await waitForCondition(
        async () =>
          cdp!.eval<boolean>(
            `(document.body?.textContent || "").includes("Pronto") && !(document.body?.textContent || "").includes("Concordância Verbal e Nominal")`,
          ),
        4000,
        "retorno ao estado Pronto com tela 100% limpa no Cronômetro",
      );

      // 7) Testa Autocomplete no Cronômetro ("portugues" -> "Português") e navegação Tab
      await cdp.setInputValue("#subject-input", "portugues");
      const hasCanonicalSuggestion = await cdp.eval<boolean>(`(() => {
        const opts = Array.from(document.querySelectorAll('[role="option"]')).map((o) => o.textContent);
        return opts.includes("Português");
      })()`);
      assert.equal(hasCanonicalSuggestion, true);

      await cdp.pressKey("ArrowDown", "ArrowDown", 40);
      await cdp.pressKey("Enter", "Enter", 13);
      assert.equal(
        await cdp.eval<string>(`document.querySelector("#subject-input").value`),
        "Português",
      );

      await cdp.clickSelector('button[aria-label="Exibir matérias salvas"]');
      assert.equal(
        await cdp.eval<boolean>(`Boolean(document.querySelector('[role="listbox"]'))`),
        true,
      );
      const scrollbarMouseDownPrevented = await cdp.eval<boolean>(`(() => {
        const lb = document.querySelector('[role="listbox"]');
        if (!lb) return false;
        const ev = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
        lb.dispatchEvent(ev);
        return ev.defaultPrevented && Boolean(document.querySelector('[role="listbox"]'));
      })()`);
      assert.equal(
        scrollbarMouseDownPrevented,
        true,
        "Mousedown na barra de rolagem do listbox não deve fechar o dropdown por blur",
      );
      await cdp.pressKey("Tab", "Tab", 9);
      await waitForCondition(
        async () =>
          cdp!.eval<boolean>(
            `!document.querySelector('[role="listbox"]') && document.activeElement?.id === "topic-input"`,
          ),
        2000,
        "fechamento do dropdown ao navegar com Tab",
      );

      // 8) Cria 2ª sessão rápida ("RLM") para testar filtro, edição e exclusão na aba Histórico
      await cdp.setInputValue("#subject-input", "RLM");
      await cdp.setInputValue("#topic-input", "Tabela Verdade");
      await cdp.clickButtonByText("Questões");
      await sleep(1100);
      await cdp.clickButtonByText("Finalizar Estudo");
      await waitForCondition(
        async () =>
          cdp!.eval<boolean>(`(document.body?.textContent || "").includes("Pronto")`),
        3000,
        "finalização da sessão RLM",
      );

      // Navega para a aba Histórico
      await cdp.clickSelector('button[role="tab"]:nth-of-type(2)');
      await waitForCondition(
        async () =>
          cdp!.eval<boolean>(
            `(document.body?.textContent || "").includes("2 registros") && (document.body?.textContent || "").includes("Concordância Verbal e Nominal") && (document.body?.textContent || "").includes("Tabela Verdade")`,
          ),
        3000,
        "carregamento dos 2 registros no Relatório de Estudos",
      );

      // Auditoria monocromática, tipográfica e de ausência de overflow horizontal na aba Histórico
      const historyMonoAudit = await cdp.eval<{ ok: boolean; [k: string]: any }>(
        AUDIT_MONOCHROME_EXPR,
      );
      assert.equal(
        historyMonoAudit.ok,
        true,
        `Violação monocromática na aba Histórico: ${JSON.stringify(historyMonoAudit)}`,
      );

      const historyLayoutAndFonts = await cdp.eval<{
        reportHeadingFont: string;
        subjectCellFont: string;
        durationCellFont: string;
        actionBtnFont: string;
        tableScrollWidth: number;
        tableClientWidth: number;
      }>(`(() => {
        const tableWrapper = document.querySelector("table").parentElement;
        const firstRow = document.querySelector("tbody tr");
        const tds = firstRow.querySelectorAll("td");
        return {
          reportHeadingFont: getComputedStyle(document.querySelector("main h2")).fontFamily,
          subjectCellFont: getComputedStyle(tds[1]).fontFamily,
          durationCellFont: getComputedStyle(tds[3]).fontFamily,
          actionBtnFont: getComputedStyle(tds[8].querySelector("button")).fontFamily,
          tableScrollWidth: tableWrapper.scrollWidth,
          tableClientWidth: tableWrapper.clientWidth,
        };
      })()`);
      assert.match(historyLayoutAndFonts.reportHeadingFont, /Romana-Book/i);
      assert.match(historyLayoutAndFonts.subjectCellFont, /AkkuratPro-Regular/i);
      assert.match(historyLayoutAndFonts.durationCellFont, /Akkurat-Mono/i);
      assert.match(historyLayoutAndFonts.actionBtnFont, /Akkurat-Mono/i);
      assert.ok(
        historyLayoutAndFonts.tableScrollWidth <= historyLayoutAndFonts.tableClientWidth,
        `Tabela de histórico não deve ter overflow horizontal (${historyLayoutAndFonts.tableScrollWidth}px > ${historyLayoutAndFonts.tableClientWidth}px)`,
      );

      // Testa busca no relatório e limpeza de filtros
      await cdp.setInputValue("#history-search-input", "concordancia");
      await waitForCondition(
        async () =>
          cdp!.eval<boolean>(
            `(document.body?.textContent || "").includes("1 registro") && !(document.body?.textContent || "").includes("Tabela Verdade")`,
          ),
        2000,
        "filtragem por busca textual sem acento",
      );
      await cdp.clickButtonByText("Limpar filtros");
      await waitForCondition(
        async () =>
          cdp!.eval<boolean>(`(document.body?.textContent || "").includes("2 registros")`),
        2000,
        "limpeza de filtros do histórico",
      );

      // Testa Edição de Matéria e Tópico + Autocomplete customizado sem <datalist> + Focus Trap
      await cdp.clickSelector('button[aria-label="Editar registro de Português"]');
      await waitForCondition(
        async () =>
          cdp!.eval<boolean>(
            `document.activeElement?.id === "edit-subject-input" && !document.querySelector("datalist")`,
          ),
        2000,
        "abertura do modal de edição com foco inicial e sem datalist nativo",
      );

      // Verifica focus trap por teclado (Tab cicla estritamente dentro do modal de edição)
      for (let step = 0; step < 6; step++) {
        await cdp.pressKey("Tab", "Tab", 9);
        const insideEditDialog = await cdp.eval<boolean>(
          `Boolean(document.querySelector('[role="dialog"]')?.contains(document.activeElement))`,
        );
        assert.equal(insideEditDialog, true, "Tab não deve escapar do modal de edição");
      }

      // Digita "rl" no campo de matéria do modal -> abre sugestão monocromática -> Escape fecha só a lista
      await cdp.setInputValue("#edit-subject-input", "rl");
      await waitForCondition(
        async () =>
          cdp!.eval<boolean>(
            `Array.from(document.querySelectorAll('[role="option"]')).some((o) => o.textContent === "RLM")`,
          ),
        2000,
        "sugestão customizada no modal de edição",
      );
      await cdp.pressKey("Escape", "Escape", 27);
      await waitForCondition(
        async () =>
          cdp!.eval<boolean>(
            `!document.querySelector('[role="listbox"]') && Boolean(document.querySelector("#edit-subject-input"))`,
          ),
        2000,
        "Escape fecha apenas o dropdown de sugestões sem descartar o modal de edição",
      );

      await cdp.setInputValue("#edit-subject-input", "   ");
      await cdp.clickButtonByText("Salvar Alterações");
      await waitForCondition(
        async () =>
          cdp!.eval<boolean>(
            `(document.body?.textContent || "").includes("Informe a matéria para salvar as alterações.")`,
          ),
        2000,
        "validação de matéria vazia na edição do histórico",
      );

      await cdp.setInputValue("#edit-subject-input", "  Língua Portuguesa  ");
      await cdp.setInputValue("#edit-topic-input", "  Sintaxe e Concordância  ");
      await cdp.clickButtonByText("Salvar Alterações");
      await waitForCondition(
        async () =>
          cdp!.eval<boolean>(
            `!document.querySelector("#edit-subject-input") && (document.body?.textContent || "").includes("Língua Portuguesa") && (document.body?.textContent || "").includes("Sintaxe e Concordância")`,
          ),
        3000,
        "persistência e atualização visual da edição no histórico",
      );

      // Testa Exclusão com Pop-up de Confirmação + Foco Inicial em Cancelar + Focus Trap
      await cdp.clickSelector('button[aria-label="Excluir registro de RLM"]');
      await waitForCondition(
        async () =>
          cdp!.eval<boolean>(
            `Boolean(document.querySelector('[role="dialog"]')) && (document.activeElement?.textContent || "").includes("Cancelar")`,
          ),
        2000,
        "abertura do pop-up de confirmação de exclusão com foco inicial em Cancelar",
      );
      await cdp.pressKey("Tab", "Tab", 9);
      assert.equal(
        await cdp.eval<boolean>(
          `(document.activeElement?.textContent || "").includes("Confirmar Exclusão")`,
        ),
        true,
      );
      await cdp.pressKey("Tab", "Tab", 9);
      assert.equal(
        await cdp.eval<boolean>(
          `(document.activeElement?.textContent || "").includes("Cancelar")`,
        ),
        true,
        "Tab no pop-up de exclusão deve retornar para Cancelar (focus trap)",
      );

      await cdp.clickButtonByText("Cancelar");
      await waitForCondition(
        async () =>
          cdp!.eval<boolean>(
            `!document.querySelector('[role="dialog"]') && (document.body?.textContent || "").includes("2 registros") && (document.body?.textContent || "").includes("RLM")`,
          ),
        2000,
        "cancelamento da exclusão preserva o registro",
      );

      await cdp.clickSelector('button[aria-label="Excluir registro de RLM"]');
      await waitForCondition(
        async () =>
          cdp!.eval<boolean>(`Boolean(document.querySelector('[role="dialog"]'))`),
        2000,
        "reabertura do pop-up de confirmação de exclusão",
      );
      await cdp.clickButtonByText("Confirmar Exclusão");
      await waitForCondition(
        async () =>
          cdp!.eval<boolean>(
            `!document.querySelector('[role="dialog"]') && (document.body?.textContent || "").includes("1 registro") && !(document.body?.textContent || "").includes("Tabela Verdade")`,
          ),
        3000,
        "exclusão confirmada atualiza o relatório imediatamente",
      );

      // Volta para a aba Cronômetro, inicia sessão ativa e testa modais sobrepostos (Edit Modal + WM_CLOSE RN04)
      await cdp.clickSelector('button[role="tab"]:nth-of-type(1)');
      await waitForCondition(
        async () =>
          cdp!.eval<boolean>(`Boolean(document.querySelector("#subject-input"))`),
        2000,
        "retorno à aba Cronômetro",
      );

      await cdp.setInputValue("#subject-input", "Direito Constitucional");
      await cdp.setInputValue("#topic-input", "Controle Difuso");
      await cdp.clickButtonByText("Videoaula");
      await sleep(1150);

      await cdp.setInputValue("#subject-input", "");
      await cdp.setInputValue("#topic-input", "Controle Concentrado");

      // Abre modal de edição no Histórico enquanto sessão está ativa e dispara WM_CLOSE sobreposto
      await cdp.clickSelector('button[role="tab"]:nth-of-type(2)');
      await waitForCondition(
        async () =>
          cdp!.eval<boolean>(
            `Boolean(document.querySelector('button[aria-label="Editar registro de Língua Portuguesa"]'))`,
          ),
        2000,
        "abertura do Histórico com sessão ativa",
      );
      await cdp.clickSelector('button[aria-label="Editar registro de Língua Portuguesa"]');
      await waitForCondition(
        async () =>
          cdp!.eval<boolean>(`document.activeElement?.id === "edit-subject-input"`),
        2000,
        "foco em #edit-subject-input antes do WM_CLOSE",
      );

      sendWin32CloseToProcess(proc.pid!);
      await waitForCondition(
        async () =>
          cdp!.eval<boolean>(
            `(document.body?.textContent || "").includes("Sessão de estudo em andamento") && (document.activeElement?.textContent || "").includes("Continuar Estudando")`,
          ),
        4000,
        "CloseConfirmModal assume o foco imediatamente sobre o modal de edição",
      );
      assert.equal(proc.exitCode, null, "Processo não deve fechar sem confirmação");

      // Tab fica preso no CloseConfirmModal no topo, nunca vazando para #edit-subject-input
      await cdp.pressKey("Tab", "Tab", 9);
      assert.equal(
        await cdp.eval<boolean>(
          `(document.activeElement?.textContent || "").includes("Encerrar, Salvar e Sair")`,
        ),
        true,
      );
      await cdp.pressKey("Tab", "Tab", 9);
      assert.equal(
        await cdp.eval<boolean>(
          `(document.activeElement?.textContent || "").includes("Continuar Estudando")`,
        ),
        true,
      );

      // Escape fecha APENAS o CloseConfirmModal e devolve o foco ao #edit-subject-input do modal abaixo
      await cdp.pressKey("Escape", "Escape", 27);
      await waitForCondition(
        async () =>
          cdp!.eval<boolean>(
            `!(document.body?.textContent || "").includes("Sessão de estudo em andamento") && document.activeElement?.id === "edit-subject-input"`,
          ),
        2000,
        "restauração de foco ao modal de edição após fechar CloseConfirmModal com Escape",
      );

      // Segundo Escape fecha o modal de edição
      await cdp.pressKey("Escape", "Escape", 27);
      await waitForCondition(
        async () =>
          cdp!.eval<boolean>(`!document.querySelector("#edit-subject-input")`),
        2000,
        "fechamento do modal de edição por Escape",
      );

      sendWin32CloseToProcess(proc.pid!);
      await waitForCondition(
        async () =>
          cdp!.eval<boolean>(
            `(document.body?.textContent || "").includes("Sessão de estudo em andamento")`,
          ),
        4000,
        "reabertura do modal RN04",
      );

      const exitPromise = new Promise<number | null>((resolve) => {
        proc!.once("exit", (code) => resolve(code));
      });
      await cdp.clickButtonByText("Encerrar, Salvar e Sair");
      const exitCode = await exitPromise;
      assert.equal(exitCode, 0, "confirm_close_and_exit deve encerrar com código 0");
      cdp.close();
      cdp = null;
      proc = null;

      // 9) Valida SQLite após edição, exclusão e confirm_close_and_exit + truncamento WAL
      const dbFile = path.join(dataDir, "study_chrono.db");
      const walFile = path.join(dataDir, "study_chrono.db-wal");
      assert.equal(fs.existsSync(dbFile), true, "study_chrono.db deve existir");
      if (fs.existsSync(walFile)) {
        assert.equal(
          fs.statSync(walFile).size,
          0,
          "study_chrono.db-wal deve estar truncado (0 bytes) após confirm_close_and_exit",
        );
      }

      const db = new DatabaseSync(dbFile);
      const rows = db
        .prepare(
          "SELECT subject, topic, total_active_sec, status, end_time FROM study_sessions ORDER BY id ASC",
        )
        .all() as Array<{
        subject: string;
        topic: string;
        total_active_sec: number;
        status: string;
        end_time: string | null;
      }>;

      assert.equal(rows.length, 2, "RLM deve ter sido excluído e apenas 2 registros devem restar");
      assert.equal(rows[0].subject, "Língua Portuguesa");
      assert.equal(rows[0].topic, "Sintaxe e Concordância");
      assert.equal(rows[0].status, "COMPLETED");
      assert.ok(rows[0].total_active_sec >= 1);
      assert.ok(rows[0].end_time);

      assert.equal(rows[1].subject, "Direito Constitucional");
      assert.equal(rows[1].topic, "Controle Concentrado");
      assert.equal(rows[1].status, "COMPLETED");
      assert.ok(rows[1].total_active_sec >= 1);
      assert.ok(rows[1].end_time);

      const studyDate = (
        db
          .prepare("SELECT study_date FROM study_sessions LIMIT 1")
          .get() as { study_date: string }
      ).study_date;

      // Insere sessão IN_PROGRESS (RN05), sessão cruzando meia-noite (23:55 -> 00:15) e > 2.000 sessões históricas
      db.exec("BEGIN TRANSACTION;");
      db.prepare(
        `INSERT INTO study_sessions (
          study_date, start_time, subject, topic,
          time_reading_sec, total_active_sec, status
        ) VALUES (?, ?, ?, ?, 1500, 1500, 'IN_PROGRESS')`,
      ).run(studyDate, `${studyDate}T06:00:00-03:00`, "Informática", "Segurança");

      db.prepare(
        `INSERT INTO study_sessions (
          study_date, start_time, end_time, subject, topic,
          time_reading_sec, total_active_sec, status
        ) VALUES (?, ?, ?, ?, ?, 1200, 1200, 'COMPLETED')`,
      ).run(
        "2026-10-20",
        "2026-10-20T23:55:00-03:00",
        "2026-10-21T00:15:00-03:00",
        "Direito Penal",
        "Sessão Madrugada",
      );

      const bulkStmt = db.prepare(
        `INSERT INTO study_sessions (
          study_date, start_time, end_time, subject, topic,
          time_reading_sec, total_active_sec, status
        ) VALUES (?, ?, ?, ?, ?, 60, 60, 'COMPLETED')`,
      );
      for (let i = 0; i < 2049; i++) {
        bulkStmt.run(
          "2026-09-15",
          "2026-09-15T10:00:00-03:00",
          "2026-09-15T10:01:00-03:00",
          `Matéria Carga ${(i % 8) + 1}`,
          `Tópico ${i + 1}`,
        );
      }
      db.exec("COMMIT;");
      db.close();

      // =========================================================================
      // EXECUÇÃO 2: Persistência do Tema Claro + RN05 + Paginação > 2.000 + Meia-Noite
      // =========================================================================
      const cdpPort2 = cdpPort1 + 1;
      proc = spawnBinary(cdpPort2);
      cdp = await CdpClient.connect(cdpPort2);

      await waitForCondition(
        async () =>
          cdp!.eval<boolean>(
            `!document.documentElement.classList.contains("dark") && (document.body?.textContent || "").includes("Recuperação automática:") && (document.body?.textContent || "").includes("Informática: 00:25:00")`,
          ),
        6000,
        "persistência do tema Claro e banner RN05 na reabertura",
      );

      // Verifica ausência de sobreposição entre o cabeçalho e o formulário mesmo com banner RN05 visível
      const noHeaderOverlap = await cdp.eval<boolean>(`(() => {
        const headerBottom = document.querySelector("header").getBoundingClientRect().bottom;
        const inputSectionTop = document.querySelector("#subject-input").closest("section").getBoundingClientRect().top;
        return inputSectionTop >= headerBottom;
      })()`);
      assert.equal(
        noHeaderOverlap,
        true,
        "A seção de entrada no Cronômetro nunca deve sobrepor o cabeçalho",
      );

      // Verifica badge Rec., paginação sob > 2.000 registros e ausência estrita de overflow horizontal em 900x720, 784x640 e 760x640
      await cdp.clickSelector('button[role="tab"]:nth-of-type(2)');
      await waitForCondition(
        async () =>
          cdp!.eval<boolean>(
            `(document.body?.textContent || "").includes("2053 registros") && (document.body?.textContent || "").includes("Rec.") && (document.body?.textContent || "").includes("Página 1 de 21") && document.querySelectorAll("tbody tr").length === 100`,
          ),
        4000,
        "paginação de 100 linhas e exibição de 2053 registros no Histórico",
      );

      for (const [winW, winH] of [
        [900, 720],
        [784, 640],
        [760, 640],
      ] as const) {
        resizeProcessWindow(proc.pid!, winW, winH);
        await sleep(250);
        const responsiveHist = await cdp.eval<{
          scrollW: number;
          clientW: number;
          deleteBtnRight: number;
          wrapperRight: number;
          filterHeightSpread: number;
          summaryHeightSpread: number;
        }>(`(() => {
          const wrapper = document.querySelector("table").parentElement;
          const wrapperRect = wrapper.getBoundingClientRect();
          const delBtn = document.querySelector('tbody tr button[title="Excluir registro"]');
          const delRect = delBtn.getBoundingClientRect();
          const filterHeights = [
            "#history-search-input",
            "#history-subject-filter",
            "#history-date-filter",
          ].map((sel) => document.querySelector(sel).getBoundingClientRect().height);
          const summaryCards = Array.from(
            document.querySelector("#history-search-input").closest("section").lastElementChild.children,
          ).map((el) => el.getBoundingClientRect().height);
          return {
            scrollW: wrapper.scrollWidth,
            clientW: wrapper.clientWidth,
            deleteBtnRight: delRect.right,
            wrapperRight: wrapperRect.right,
            filterHeightSpread: Math.max(...filterHeights) - Math.min(...filterHeights),
            summaryHeightSpread: Math.max(...summaryCards) - Math.min(...summaryCards),
          };
        })()`);
        assert.ok(
          responsiveHist.scrollW <= responsiveHist.clientW,
          `Sem barra horizontal na tabela do Histórico em ${winW}x${winH} (${responsiveHist.scrollW}px > ${responsiveHist.clientW}px)`,
        );
        assert.ok(
          responsiveHist.deleteBtnRight <= responsiveHist.wrapperRight + 0.5,
          `Botão Excluir deve estar 100% visível sem corte em ${winW}x${winH} (${responsiveHist.deleteBtnRight} > ${responsiveHist.wrapperRight})`,
        );
        assert.ok(
          responsiveHist.filterHeightSpread < 1,
          `Controles de filtro devem ter altura uniforme em ${winW}x${winH} (spread=${responsiveHist.filterHeightSpread})`,
        );
        assert.ok(
          responsiveHist.summaryHeightSpread < 1,
          `Cards de resumo consolidado devem manter altura uniforme sem quebra em ${winW}x${winH} (spread=${responsiveHist.summaryHeightSpread})`,
        );
      }
      resizeProcessWindow(proc.pid!, 900, 720);
      await sleep(200);

      await cdp.clickSelector('button[aria-label="Próxima página"]');
      await waitForCondition(
        async () =>
          cdp!.eval<boolean>(
            `(document.body?.textContent || "").includes("Página 2 de 21") && document.querySelectorAll("tbody tr").length === 100`,
          ),
        2000,
        "navegação para a Página 2 da tabela de histórico",
      );

      // Aplica filtros combinados (data de início + matéria + busca textual) para sessão que cruzou meia-noite
      await cdp.eval(`(() => {
        const sel = document.querySelector("#history-subject-filter");
        sel.value = "Direito Penal";
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      })()`);
      await cdp.setInputValue("#history-date-filter", "2026-10-20");
      await cdp.setInputValue("#history-search-input", "madrugada");
      await waitForCondition(
        async () =>
          cdp!.eval<boolean>(
            `(document.body?.textContent || "").includes("1 registro") && (document.body?.textContent || "").includes("23:55–00:15") && document.querySelectorAll("tbody tr").length === 1`,
          ),
        2000,
        "filtragem combinada da sessão que cruzou meia-noite (23:55–00:15)",
      );

      // Em Idle, enviar WM_CLOSE deve fechar a janela imediatamente sem abrir modal
      const idleExitPromise = new Promise<number | null>((resolve) => {
        proc!.once("exit", (code) => resolve(code));
      });
      sendWin32CloseToProcess(proc.pid!);
      const idleExitCode = await idleExitPromise;
      assert.equal(idleExitCode, 0, "Fechamento em Idle deve encerrar imediatamente");
      cdp.close();
      cdp = null;
      proc = null;
    } finally {
      if (cdp) cdp.close();
      if (proc && proc.exitCode === null) {
        proc.kill();
      }
      await sleep(400);
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  },
);
