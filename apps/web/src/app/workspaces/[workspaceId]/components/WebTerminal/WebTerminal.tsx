"use client";

import { FitAddon } from "@xterm/addon-fit";
import type { ITheme } from "@xterm/xterm";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { getAuthToken } from "../../../../../trpc/auth-token";
import { getRelayUrl } from "../../../../../trpc/relay-url";

const TERMINAL_THEME: ITheme = {
	background: "#151110",
	foreground: "#eae8e6",
	cursor: "#e07850",
	cursorAccent: "#151110",
	selectionBackground: "rgba(224, 120, 80, 0.25)",
	black: "#151110",
	red: "#dc6b6b",
	green: "#7ec699",
	yellow: "#e5c07b",
	blue: "#61afef",
	magenta: "#c678dd",
	cyan: "#56b6c2",
	white: "#eae8e6",
	brightBlack: "#5c5856",
	brightRed: "#e88888",
	brightGreen: "#98d1a8",
	brightYellow: "#ecd08f",
	brightBlue: "#7ec0f5",
	brightMagenta: "#d494e6",
	brightCyan: "#73c7d3",
	brightWhite: "#ffffff",
};

const TERMINAL_FONT_FAMILY =
	'"JetBrains Mono", "MesloLGS NF", "Menlo", "Monaco", "Courier New", monospace';

const KEY_BUTTONS: Array<{ label: string; sequence: string }> = [
	{ label: "Tab", sequence: "\t" },
	{ label: "Esc", sequence: "\x1b" },
	{ label: "Ctrl-C", sequence: "\x03" },
	{ label: "Ctrl-D", sequence: "\x04" },
	{ label: "↑", sequence: "\x1b[A" },
	{ label: "↓", sequence: "\x1b[B" },
	{ label: "←", sequence: "\x1b[D" },
	{ label: "→", sequence: "\x1b[C" },
];

interface WebTerminalProps {
	workspaceId: string;
	terminalId: string;
	routingKey: string;
}

type ConnectionState = "connecting" | "open" | "error" | "exited";

// Wire protocol mirrors the desktop's terminal transport
// (apps/desktop/src/renderer/lib/terminal/terminal-ws-transport.ts): binary
// frames are raw PTY bytes, control messages are JSON.
type TerminalServerMessage =
	| { type: "attached"; terminalId: string }
	| { type: "title"; title: string | null }
	| { type: "error"; message: string }
	| { type: "exit"; exitCode: number; signal: number };

export function WebTerminal({
	workspaceId,
	terminalId,
	routingKey,
}: WebTerminalProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const socketRef = useRef<WebSocket | null>(null);
	const [state, setState] = useState<ConnectionState>("connecting");
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const sendSequence = useCallback((sequence: string) => {
		const socket = socketRef.current;
		if (!socket || socket.readyState !== WebSocket.OPEN) return;
		socket.send(JSON.stringify({ type: "input", data: sequence }));
	}, []);

	useEffect(() => {
		let cancelled = false;
		let terminal: Terminal | null = null;
		let fitAddon: FitAddon | null = null;
		let socket: WebSocket | null = null;
		let resizeObserver: ResizeObserver | null = null;
		let resizeTimer: ReturnType<typeof setTimeout> | null = null;
		const visualViewport = window.visualViewport;

		const sendResize = () => {
			const activeSocket = socketRef.current;
			if (
				!terminal ||
				!activeSocket ||
				activeSocket.readyState !== WebSocket.OPEN
			) {
				return;
			}
			activeSocket.send(
				JSON.stringify({
					type: "resize",
					cols: terminal.cols,
					rows: terminal.rows,
				}),
			);
		};

		// Refit on every layout change; the visualViewport listeners are what
		// keep the prompt above the soft keyboard on mobile, since the keyboard
		// resizes the visual viewport rather than the layout viewport.
		const refit = () => {
			if (!fitAddon) return;
			try {
				fitAddon.fit();
			} catch {
				return;
			}
			if (resizeTimer !== null) clearTimeout(resizeTimer);
			resizeTimer = setTimeout(sendResize, 150);
		};

		(async () => {
			try {
				const token = await getAuthToken();
				if (cancelled) return;
				const container = containerRef.current;
				if (!container) return;

				terminal = new Terminal({
					cursorBlink: true,
					cursorStyle: "block",
					fontFamily: TERMINAL_FONT_FAMILY,
					fontSize: 14,
					scrollback: 5000,
					theme: TERMINAL_THEME,
					allowProposedApi: true,
				});
				fitAddon = new FitAddon();
				terminal.loadAddon(fitAddon);
				terminal.open(container);
				try {
					fitAddon.fit();
				} catch {
					// container may not be sized yet
				}

				const wsBase = getRelayUrl().replace(/^http/, "ws").replace(/\/$/, "");
				const url = `${wsBase}/hosts/${routingKey}/terminal/${encodeURIComponent(terminalId)}?workspaceId=${encodeURIComponent(workspaceId)}&themeType=dark&token=${encodeURIComponent(token)}`;
				socket = new WebSocket(url);
				socket.binaryType = "arraybuffer";
				socketRef.current = socket;

				socket.onmessage = (event) => {
					if (event.data instanceof ArrayBuffer) {
						terminal?.write(new Uint8Array(event.data));
						return;
					}
					let message: TerminalServerMessage;
					try {
						message = JSON.parse(String(event.data)) as TerminalServerMessage;
					} catch {
						return;
					}
					switch (message.type) {
						case "attached":
							setState("open");
							sendResize();
							return;
						case "exit":
							terminal?.write(
								`\r\n\x1b[33m[process exited code=${message.exitCode}]\x1b[0m\r\n`,
							);
							setState("exited");
							return;
						case "error":
							setErrorMessage(message.message);
							setState("error");
							return;
						default:
							return;
					}
				};

				socket.onclose = () => {
					setState((previous) =>
						previous === "open" || previous === "connecting"
							? "error"
							: previous,
					);
				};

				socket.onerror = () => {
					setErrorMessage("WebSocket connection failed.");
				};

				terminal.onData((data) => {
					const activeSocket = socketRef.current;
					if (activeSocket?.readyState === WebSocket.OPEN) {
						activeSocket.send(JSON.stringify({ type: "input", data }));
					}
				});

				resizeObserver = new ResizeObserver(refit);
				resizeObserver.observe(container);
				visualViewport?.addEventListener("resize", refit);
				visualViewport?.addEventListener("scroll", refit);
			} catch (caught) {
				if (cancelled) return;
				setErrorMessage(
					caught instanceof Error ? caught.message : String(caught),
				);
				setState("error");
			}
		})();

		return () => {
			cancelled = true;
			if (resizeTimer !== null) clearTimeout(resizeTimer);
			resizeObserver?.disconnect();
			visualViewport?.removeEventListener("resize", refit);
			visualViewport?.removeEventListener("scroll", refit);
			try {
				socket?.close();
			} catch {
				// best-effort
			}
			terminal?.dispose();
			socketRef.current = null;
		};
	}, [workspaceId, terminalId, routingKey]);

	return (
		<div className="flex h-full flex-col">
			<div className="relative flex-1 overflow-hidden">
				<div ref={containerRef} className="absolute inset-0" />
				{state !== "open" && (
					<div
						className="absolute inset-x-0 top-0 px-3 py-1 text-xs"
						style={{ color: "#ecd08f" }}
					>
						{state === "connecting"
							? "Connecting…"
							: state === "exited"
								? "Process exited."
								: (errorMessage ?? "Disconnected.")}
					</div>
				)}
			</div>
			<div
				className="flex flex-wrap gap-1 border-t p-1"
				style={{ borderColor: "#2a2827", backgroundColor: "#1a1716" }}
			>
				{KEY_BUTTONS.map((button) => (
					<button
						key={button.label}
						type="button"
						onClick={() => sendSequence(button.sequence)}
						className="rounded border px-2 py-1 text-xs"
						style={{ borderColor: "#2a2827", color: "#eae8e6" }}
					>
						{button.label}
					</button>
				))}
			</div>
		</div>
	);
}
