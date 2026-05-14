"use client";

import {
	REMOTE_CONTROL_TOKEN_PARAM,
	type RemoteControlClientMessage,
	type RemoteControlMode,
	type RemoteControlServerMessage,
	type RemoteControlStatus,
} from "@superset/shared/remote-control-protocol";
import { FitAddon } from "@xterm/addon-fit";
import type { ITheme } from "@xterm/xterm";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { trpcClient } from "../../../../../../../trpc/client";
import { MobileToolbar } from "./components/MobileToolbar";

// Mirrors apps/desktop/src/shared/themes/built-in/ember.ts (id "dark")
// so the browser viewer renders the same palette as the desktop default
// terminal theme. Keep in sync if the desktop default changes.
const DESKTOP_DARK_TERMINAL_THEME: ITheme = {
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

// Mirrors apps/desktop/src/renderer/lib/terminal/appearance/index.ts
// `DEFAULT_TERMINAL_FONT_FAMILIES` so we fall through the same Nerd Font
// stack as the desktop and only land on `monospace` when nothing else
// is installed.
const DESKTOP_TERMINAL_FONT_FAMILY =
	'"JetBrains Mono", "JetBrainsMono Nerd Font", "MesloLGM Nerd Font", "MesloLGM NF", "MesloLGS NF", "MesloLGS Nerd Font", "Hack Nerd Font", "FiraCode Nerd Font", "CaskaydiaCove Nerd Font", "Menlo", "Monaco", "Courier New", monospace';
const DESKTOP_TERMINAL_FONT_SIZE = 14;
const DESKTOP_TERMINAL_SCROLLBACK = 5000;

interface RemoteTerminalProps {
	sessionId: string;
	token: string;
}

type ConnectionState =
	| "loading"
	| "connecting"
	| "open"
	| "revoked"
	| "expired"
	| "exited"
	| "error";

interface SessionMeta {
	// `null` for revoked/expired sessions — cloud refuses to hand out
	// a WS endpoint for non-active rows as defense-in-depth.
	wsUrl: string | null;
	mode: RemoteControlMode;
	status: RemoteControlStatus;
	terminalId: string;
}

function bytesToBase64(bytes: Uint8Array): string {
	let bin = "";
	for (const byte of bytes) {
		bin += String.fromCharCode(byte);
	}
	return btoa(bin);
}

function base64ToBytes(s: string): Uint8Array {
	const bin = atob(s);
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
	return bytes;
}

export function RemoteTerminal({ sessionId, token }: RemoteTerminalProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const termRef = useRef<Terminal | null>(null);
	const fitRef = useRef<FitAddon | null>(null);
	const wsRef = useRef<WebSocket | null>(null);
	const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

	const [state, setState] = useState<ConnectionState>("loading");
	const [meta, setMeta] = useState<SessionMeta | null>(null);
	const [title, setTitle] = useState<string | null>(null);
	const [errorMsg, setErrorMsg] = useState<string | null>(null);
	const [viewerCount, setViewerCount] = useState<number | null>(null);

	const sendClientMessage = useCallback((msg: RemoteControlClientMessage) => {
		const ws = wsRef.current;
		if (!ws || ws.readyState !== WebSocket.OPEN) return;
		ws.send(JSON.stringify(msg));
	}, []);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				// `.mutate()` rather than `.query()` so the bearer token rides
				// in the POST body. A query would put it in the URL.
				const result = await trpcClient.remoteControl.get.mutate({
					sessionId,
					token,
				});
				if (cancelled) return;
				if (result.status !== "active") {
					setMeta({
						wsUrl: result.wsUrl,
						mode: result.mode,
						status: result.status,
						terminalId: result.terminalId,
					});
					setState(
						result.status === "expired"
							? "expired"
							: result.status === "revoked"
								? "revoked"
								: "error",
					);
					return;
				}
				setMeta({
					wsUrl: result.wsUrl,
					mode: result.mode,
					status: result.status,
					terminalId: result.terminalId,
				});
				setState("connecting");
			} catch (err) {
				setErrorMsg(err instanceof Error ? err.message : String(err));
				setState("error");
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [sessionId, token]);

	useEffect(() => {
		// Only run when we have a usable, active session. We deliberately do
		// NOT depend on `state` — `setState("open")` would otherwise re-run
		// this effect, triggering the cleanup which sends `stop` and closes
		// the WS the moment it finishes connecting.
		if (!meta || meta.status !== "active" || !meta.wsUrl) return;
		if (!containerRef.current) return;

		// `vtExtensions` (kittyKeyboard) and `scrollbar` are only present on
		// the desktop's xterm beta build; the stable web release omits them.
		// Everything else here mirrors createTerminal in
		// apps/desktop/src/renderer/lib/terminal/terminal-runtime.ts.
		const term = new Terminal({
			cursorBlink: true,
			cursorStyle: "block",
			cursorInactiveStyle: "outline",
			fontFamily: DESKTOP_TERMINAL_FONT_FAMILY,
			fontSize: DESKTOP_TERMINAL_FONT_SIZE,
			scrollback: DESKTOP_TERMINAL_SCROLLBACK,
			theme: DESKTOP_DARK_TERMINAL_THEME,
			allowProposedApi: true,
			macOptionIsMeta: false,
		});
		const fit = new FitAddon();
		term.loadAddon(fit);
		term.open(containerRef.current);
		try {
			fit.fit();
		} catch {
			// container may not yet be sized
		}
		termRef.current = term;
		fitRef.current = fit;

		const url = `${meta.wsUrl}?${REMOTE_CONTROL_TOKEN_PARAM}=${encodeURIComponent(token)}`;
		const ws = new WebSocket(url);
		wsRef.current = ws;

		ws.onopen = () => {
			setState("open");
			pingTimerRef.current = setInterval(() => {
				sendClientMessage({ type: "ping" });
			}, 25_000);
		};

		ws.onmessage = (event) => {
			let msg: RemoteControlServerMessage;
			try {
				msg = JSON.parse(String(event.data)) as RemoteControlServerMessage;
			} catch {
				return;
			}
			switch (msg.type) {
				case "hello":
					setTitle(msg.title);
					try {
						term.resize(msg.cols, msg.rows);
					} catch {
						// best-effort
					}
					return;
				case "snapshot":
				case "data":
					term.write(base64ToBytes(msg.data));
					return;
				case "title":
					setTitle(msg.title);
					return;
				case "exit":
					term.write(
						`\r\n\x1b[33m[terminal exited code=${msg.exitCode} signal=${msg.signal}]\x1b[0m\r\n`,
					);
					setState("exited");
					return;
				case "revoked":
					setState("revoked");
					return;
				case "presence":
					setViewerCount(msg.viewerCount);
					return;
				case "error":
					setErrorMsg(`${msg.code}: ${msg.message}`);
					return;
				case "pong":
					return;
			}
		};

		ws.onclose = () => {
			if (pingTimerRef.current) {
				clearInterval(pingTimerRef.current);
				pingTimerRef.current = null;
			}
			setState((prev) =>
				prev === "open" || prev === "connecting" ? "error" : prev,
			);
		};

		ws.onerror = () => {
			setErrorMsg("WebSocket connection failed");
		};

		// Show a one-time hint in `command` mode the first time the user
		// types — otherwise keystrokes are silently dropped, with no local
		// echo or feedback to explain why nothing happens.
		let readOnlyHintShown = false;
		const dataDispose = term.onData((data) => {
			if (meta.mode !== "full") {
				if (!readOnlyHintShown) {
					readOnlyHintShown = true;
					term.write(
						"\r\n\x1b[90m[view-only — host shared this terminal in command mode]\x1b[0m\r\n",
					);
				}
				return;
			}
			const bytes = new TextEncoder().encode(data);
			sendClientMessage({ type: "input", data: bytesToBase64(bytes) });
		});

		// ResizeObserver can fire ~60Hz during a window-drag. The host
		// enforces REMOTE_CONTROL_RESIZE_RATE_PER_SEC = 10, so an
		// unthrottled broadcast trips the "rate-limited" error during
		// normal use. We `fit()` the local terminal every event so the
		// viewer feels responsive, but trailing-debounce the host
		// broadcast at 200ms (5 Hz, well under the 10/s cap, and only
		// fires once after the user stops dragging).
		let pendingResize: { cols: number; rows: number } | null = null;
		let resizeTimer: ReturnType<typeof setTimeout> | null = null;
		const flushResize = () => {
			resizeTimer = null;
			if (!pendingResize) return;
			const { cols, rows } = pendingResize;
			pendingResize = null;
			sendClientMessage({ type: "resize", cols, rows });
		};
		const onResize = () => {
			if (!fitRef.current || !termRef.current) return;
			try {
				fitRef.current.fit();
			} catch {
				return;
			}
			if (meta.mode !== "full") return;
			pendingResize = {
				cols: termRef.current.cols,
				rows: termRef.current.rows,
			};
			if (resizeTimer !== null) clearTimeout(resizeTimer);
			resizeTimer = setTimeout(flushResize, 200);
		};
		const ro = new ResizeObserver(onResize);
		ro.observe(containerRef.current);

		return () => {
			ro.disconnect();
			if (resizeTimer !== null) {
				clearTimeout(resizeTimer);
				resizeTimer = null;
			}
			pendingResize = null;
			dataDispose.dispose();
			try {
				sendClientMessage({ type: "stop" });
			} catch {
				// best-effort
			}
			if (pingTimerRef.current) {
				clearInterval(pingTimerRef.current);
				pingTimerRef.current = null;
			}
			try {
				ws.close();
			} catch {
				// best-effort
			}
			term.dispose();
			termRef.current = null;
			fitRef.current = null;
			wsRef.current = null;
		};
	}, [meta, token, sendClientMessage]);

	const sendInputBytes = useCallback(
		(bytes: Uint8Array) => {
			sendClientMessage({ type: "input", data: bytesToBase64(bytes) });
		},
		[sendClientMessage],
	);

	const onCopyLink = useCallback(async () => {
		try {
			await navigator.clipboard.writeText(window.location.href);
		} catch {
			// best-effort
		}
	}, []);

	const onStop = useCallback(async () => {
		try {
			// `revoke` is a `protectedProcedure` (org member + host member) —
			// anonymous viewers (the common case for shared links) wouldn't be
			// able to call it. `revokeWithToken` is gated by the same HMAC the
			// viewer used to attach, so anyone who can see the terminal can
			// also stop it.
			await trpcClient.remoteControl.revokeWithToken.mutate({
				sessionId,
				token,
			});
		} catch (err) {
			setErrorMsg(err instanceof Error ? err.message : String(err));
		}
	}, [sessionId, token]);

	const isFull = meta?.mode === "full" && state === "open";

	return (
		<div
			className="flex h-screen flex-col font-sans"
			style={{ backgroundColor: "#151110", color: "#eae8e6" }}
		>
			<header
				className="flex items-center justify-between border-b px-4 py-2 text-sm"
				style={{ backgroundColor: "#1a1716", borderColor: "#2a2827" }}
			>
				<div className="flex min-w-0 items-center gap-3">
					<a
						href="/agents"
						className="hover:opacity-100"
						style={{ color: "#a8a5a3" }}
					>
						← Back
					</a>
					<span className="truncate font-medium">
						{title ?? meta?.terminalId ?? "Remote terminal"}
					</span>
					<span
						className="rounded px-1.5 py-0.5 text-xs"
						style={
							state === "open"
								? {
										backgroundColor: "rgba(126, 198, 153, 0.18)",
										color: "#98d1a8",
									}
								: state === "connecting" || state === "loading"
									? {
											backgroundColor: "rgba(229, 192, 123, 0.18)",
											color: "#ecd08f",
										}
									: {
											backgroundColor: "rgba(220, 107, 107, 0.18)",
											color: "#e88888",
										}
						}
					>
						{state}
					</span>
					{meta && (
						<span className="text-xs" style={{ color: "#a8a5a3" }}>
							mode: {meta.mode}
						</span>
					)}
					{viewerCount !== null && (
						<span className="text-xs" style={{ color: "#a8a5a3" }}>
							viewers: {viewerCount}
						</span>
					)}
				</div>
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={() => void onCopyLink()}
						className="rounded border px-2 py-1 text-xs transition-colors"
						style={{ borderColor: "#2a2827", color: "#eae8e6" }}
					>
						Copy link
					</button>
					<button
						type="button"
						onClick={() => void onStop()}
						className="rounded border px-2 py-1 text-xs transition-colors"
						style={{
							borderColor: "rgba(220, 107, 107, 0.45)",
							backgroundColor: "rgba(220, 107, 107, 0.12)",
							color: "#e88888",
						}}
					>
						Stop
					</button>
				</div>
			</header>
			{errorMsg && (
				<div
					className="select-text cursor-text border-b px-4 py-1 text-xs"
					style={{
						backgroundColor: "rgba(220, 107, 107, 0.12)",
						borderColor: "rgba(220, 107, 107, 0.35)",
						color: "#e88888",
					}}
				>
					{errorMsg}
				</div>
			)}
			{state === "revoked" && (
				<div
					className="select-text cursor-text px-4 py-2 text-sm"
					style={{
						backgroundColor: "rgba(220, 107, 107, 0.12)",
						color: "#e88888",
					}}
				>
					This session was revoked.
				</div>
			)}
			{state === "expired" && (
				<div
					className="select-text cursor-text px-4 py-2 text-sm"
					style={{
						backgroundColor: "rgba(229, 192, 123, 0.14)",
						color: "#ecd08f",
					}}
				>
					This session has expired. Ask the host to share a new link.
				</div>
			)}
			<div
				className="relative flex-1 overflow-hidden"
				style={{ backgroundColor: "#151110" }}
			>
				<div ref={containerRef} className="absolute inset-0" />
			</div>
			{isFull && <MobileToolbar onSend={sendInputBytes} />}
		</div>
	);
}
