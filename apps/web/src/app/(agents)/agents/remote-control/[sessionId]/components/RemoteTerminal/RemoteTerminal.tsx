"use client";

import {
	REMOTE_CONTROL_TOKEN_PARAM,
	type RemoteControlClientMessage,
	type RemoteControlMode,
	type RemoteControlServerMessage,
	type RemoteControlStatus,
} from "@superset/shared/remote-control-protocol";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { trpcClient } from "../../../../../../../trpc/client";

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
	wsUrl: string;
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
				const result = await trpcClient.remoteControl.get.query({ sessionId });
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
	}, [sessionId]);

	useEffect(() => {
		// Only run when we have a usable, active session. We deliberately do
		// NOT depend on `state` — `setState("open")` would otherwise re-run
		// this effect, triggering the cleanup which sends `stop` and closes
		// the WS the moment it finishes connecting.
		if (!meta || meta.status !== "active") return;
		if (!containerRef.current) return;

		const term = new Terminal({
			cursorBlink: true,
			fontFamily:
				'"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, monospace',
			fontSize: 13,
			scrollback: 5000,
			theme: { background: "#0a0a0a", foreground: "#d4d4d4" },
			allowProposedApi: true,
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

		const dataDispose = term.onData((data) => {
			if (meta.mode !== "full") return;
			const bytes = new TextEncoder().encode(data);
			sendClientMessage({ type: "input", data: bytesToBase64(bytes) });
		});

		const onResize = () => {
			if (!fitRef.current || !termRef.current) return;
			try {
				fitRef.current.fit();
			} catch {
				return;
			}
			if (meta.mode === "full") {
				const cols = termRef.current.cols;
				const rows = termRef.current.rows;
				sendClientMessage({ type: "resize", cols, rows });
			}
		};
		const ro = new ResizeObserver(onResize);
		ro.observe(containerRef.current);

		return () => {
			ro.disconnect();
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
			await trpcClient.remoteControl.revoke.mutate({ sessionId });
		} catch (err) {
			setErrorMsg(err instanceof Error ? err.message : String(err));
		}
	}, [sessionId]);

	const isFull = meta?.mode === "full" && state === "open";

	return (
		<div className="flex h-screen flex-col bg-black text-white">
			<header className="flex items-center justify-between border-b border-white/10 bg-[#111] px-4 py-2 text-sm">
				<div className="flex min-w-0 items-center gap-3">
					<a
						href="/agents"
						className="text-muted-foreground hover:text-foreground"
					>
						← Back
					</a>
					<span className="truncate font-medium">
						{title ?? meta?.terminalId ?? "Remote terminal"}
					</span>
					<span
						className={`rounded px-1.5 py-0.5 text-xs ${
							state === "open"
								? "bg-emerald-700/40 text-emerald-300"
								: state === "connecting" || state === "loading"
									? "bg-amber-700/40 text-amber-300"
									: "bg-red-700/40 text-red-300"
						}`}
					>
						{state}
					</span>
					{meta && (
						<span className="text-xs text-muted-foreground">
							mode: {meta.mode}
						</span>
					)}
					{viewerCount !== null && (
						<span className="text-xs text-muted-foreground">
							viewers: {viewerCount}
						</span>
					)}
				</div>
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={() => void onCopyLink()}
						className="rounded border border-white/15 px-2 py-1 text-xs hover:bg-white/10"
					>
						Copy link
					</button>
					<button
						type="button"
						onClick={() => void onStop()}
						className="rounded border border-red-500/40 bg-red-700/20 px-2 py-1 text-xs text-red-300 hover:bg-red-700/30"
					>
						Stop
					</button>
				</div>
			</header>
			{errorMsg && (
				<div className="select-text cursor-text border-b border-red-500/30 bg-red-950/40 px-4 py-1 text-xs text-red-300">
					{errorMsg}
				</div>
			)}
			{state === "revoked" && (
				<div className="select-text cursor-text bg-red-950/30 px-4 py-2 text-sm text-red-300">
					This session was revoked.
				</div>
			)}
			{state === "expired" && (
				<div className="select-text cursor-text bg-amber-950/30 px-4 py-2 text-sm text-amber-300">
					This session has expired. Ask the host to share a new link.
				</div>
			)}
			<div className="relative flex-1 overflow-hidden">
				<div ref={containerRef} className="absolute inset-0" />
			</div>
			{isFull && (
				<MobileToolbar
					onSend={sendInputBytes}
					className="border-t border-white/10 bg-[#111] px-2 py-1 sm:hidden"
				/>
			)}
		</div>
	);
}

interface MobileToolbarProps {
	onSend: (bytes: Uint8Array) => void;
	className?: string;
}

function MobileToolbar({ onSend, className }: MobileToolbarProps) {
	const send = (seq: string) => {
		onSend(new TextEncoder().encode(seq));
	};
	const buttons: Array<{ label: string; seq: string }> = [
		{ label: "Tab", seq: "\t" },
		{ label: "Esc", seq: "\x1b" },
		{ label: "Ctrl-C", seq: "\x03" },
		{ label: "Ctrl-D", seq: "\x04" },
		{ label: "↑", seq: "\x1b[A" },
		{ label: "↓", seq: "\x1b[B" },
		{ label: "←", seq: "\x1b[D" },
		{ label: "→", seq: "\x1b[C" },
	];
	return (
		<div className={className}>
			<div className="flex flex-wrap gap-1">
				{buttons.map((b) => (
					<button
						key={b.label}
						type="button"
						onClick={() => send(b.seq)}
						className="rounded border border-white/15 px-2 py-1 text-xs hover:bg-white/10"
					>
						{b.label}
					</button>
				))}
			</div>
		</div>
	);
}
