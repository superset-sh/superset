import { useRef, useEffect, useCallback, useState } from "react";

interface UseXtermReturn {
  containerRef: (node: HTMLDivElement | null) => void;
  write: (text: string) => void;
  writeln: (text: string) => void;
  clear: () => void;
  isReady: boolean;
}

export function useXterm(): UseXtermReturn {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const termRef = useRef<import("@xterm/xterm").Terminal | null>(null);
  const fitAddonRef = useRef<import("@xterm/addon-fit").FitAddon | null>(null);
  const [isReady, setIsReady] = useState(false);

  // callback ref: DOM에 붙는 시점에 container state 업데이트
  const containerRef = useCallback((node: HTMLDivElement | null) => {
    setContainer(node);
  }, []);

  useEffect(() => {
    if (!container) return;

    let disposed = false;

    async function init() {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
      ]);

      // xterm.js CSS 로드
      await import("@xterm/xterm/css/xterm.css");

      if (disposed) return;

      const fitAddon = new FitAddon();
      const terminal = new Terminal({
        theme: {
          background: "#0d0d0d",
          foreground: "#d4d4d8",
          cursor: "#c084fc",
          cursorAccent: "#0d0d0d",
          selectionBackground: "#c084fc30",
          selectionForeground: "#ffffff",
          black: "#18181b",
          red: "#f87171",
          green: "#4ade80",
          yellow: "#fbbf24",
          blue: "#60a5fa",
          magenta: "#c084fc",
          cyan: "#22d3ee",
          white: "#d4d4d8",
          brightBlack: "#71717a",
          brightRed: "#fca5a5",
          brightGreen: "#86efac",
          brightYellow: "#fde68a",
          brightBlue: "#93c5fd",
          brightMagenta: "#d8b4fe",
          brightCyan: "#67e8f9",
          brightWhite: "#fafafa",
        },
        fontSize: 13,
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
        cursorBlink: true,
        disableStdin: true,
        scrollback: 5000,
        convertEol: true,
      });

      terminal.loadAddon(fitAddon);
      terminal.open(container!);
      fitAddon.fit();

      termRef.current = terminal;
      fitAddonRef.current = fitAddon;
      setIsReady(true);

      const resizeObserver = new ResizeObserver(() => {
        try {
          fitAddon.fit();
        } catch {
          // ignore fit errors during disposal
        }
      });
      resizeObserver.observe(container!);

      return () => {
        resizeObserver.disconnect();
      };
    }

    let cleanupResize: (() => void) | undefined;
    init().then((cleanup) => {
      cleanupResize = cleanup;
    });

    return () => {
      disposed = true;
      cleanupResize?.();
      termRef.current?.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
      setIsReady(false);
    };
  }, [container]);

  const write = useCallback((text: string) => {
    termRef.current?.write(text);
  }, []);

  const writeln = useCallback((text: string) => {
    termRef.current?.writeln(text);
  }, []);

  const clear = useCallback(() => {
    termRef.current?.clear();
  }, []);

  return { containerRef, write, writeln, clear, isReady };
}
