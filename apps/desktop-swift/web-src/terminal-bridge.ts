import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import * as bridge from "./superset-bridge";

interface TerminalEntry {
  term: Terminal;
  fit: FitAddon;
  container: HTMLElement;
  resizeObserver: ResizeObserver;
}

const terminals = new Map<string, TerminalEntry>();

const FONT_FAMILY = [
  "JetBrains Mono",
  "JetBrainsMono Nerd Font",
  "MesloLGM Nerd Font",
  "MesloLGM NF",
  "Menlo",
  "Monaco",
  "Courier New",
  "monospace",
].join(", ");

function initTerminal(sessionId: string, container: HTMLElement): void {
  // Destroy existing if re-initializing (e.g., after WebView crash recovery)
  const existing = terminals.get(sessionId);
  if (existing) {
    existing.resizeObserver.disconnect();
    existing.term.dispose();
    terminals.delete(sessionId);
  }

  const fitAddon = new FitAddon();
  const term = new Terminal({
    cols: 80,
    rows: 24,
    cursorBlink: true,
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    allowProposedApi: true,
    scrollback: 10000,
    macOptionIsMeta: false,
    cursorStyle: "block",
    cursorInactiveStyle: "outline",
  });

  term.loadAddon(fitAddon);

  const unicode11 = new Unicode11Addon();
  term.loadAddon(unicode11);
  term.unicode.activeVersion = "11";

  term.open(container);

  // WebGL addon — optional optimization, canvas fallback is automatic
  requestAnimationFrame(() => {
    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => {
        webgl.dispose();
        term.refresh(0, term.rows - 1);
      });
      term.loadAddon(webgl);
    } catch {
      // WebGL not available, canvas renderer used automatically
    }
  });

  fitAddon.fit();

  // Wire keyboard input → Swift PTY
  term.onData((data) => {
    bridge.sendInput(sessionId, data);
  });

  // Wire resize → Swift PTY
  const resizeObserver = new ResizeObserver(() => {
    fitAddon.fit();
    bridge.requestResize(sessionId, term.cols, term.rows);
  });
  resizeObserver.observe(container);

  terminals.set(sessionId, { term, fit: fitAddon, container, resizeObserver });

  // Connect PTY output stream
  bridge.connectOutputStream(sessionId, {
    onData: (data) => term.write(data),
    onExit: (code, _signal) => {
      term.writeln(`\r\n\x1b[90m[Process exited with code ${code}]\x1b[0m`);
    },
    onError: (message) => {
      term.writeln(`\r\n\x1b[31m[Error: ${message}]\x1b[0m`);
    },
  });

  // Send initial resize after stream is connecting
  bridge.requestResize(sessionId, term.cols, term.rows);
}

function destroyTerminal(sessionId: string): void {
  const entry = terminals.get(sessionId);
  if (entry) {
    entry.resizeObserver.disconnect();
    entry.term.dispose();
    terminals.delete(sessionId);
  }
}

// Expose to Swift for calling via evaluateJavaScript
(window as any).__superset = {
  initTerminal,
  destroyTerminal,
};

// Signal readiness to Swift
bridge.signalReady();
