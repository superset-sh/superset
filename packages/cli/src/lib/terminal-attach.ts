/**
 * Wires a live terminal session's WebSocket protocol (see
 * `packages/host-service/src/terminal/terminal.ts`'s `TerminalClientMessage`
 * / `TerminalServerMessage`) to a local interactive TTY — the primitive
 * behind `superset terminals attach`, herdr's `agent attach` / tmux-style
 * session attach.
 *
 * Deliberately uses the *legacy* (pre-`?seq=`) attach contract: no byte-exact
 * reconnect bookkeeping, just "replay the buffer, then stream." An attach
 * session is transient and single-shot; if it drops, the user just reattaches
 * (a fresh legacy attach naturally replays the recent buffer again).
 *
 * Both `socket` and `tty` are injected interfaces so this can be unit tested
 * with fakes — no real network or real TTY involved.
 */

/** Ctrl+] — the classic telnet/rlogin escape character. Never forwarded to
 * the remote session; typing it always detaches, mirroring herdr's `ctrl+b
 * q` (a deliberate escape, distinct from Ctrl+C which must reach the
 * remote agent, not the local CLI process). */
export const DETACH_BYTE = "\x1d";

export interface AttachSocket {
	send(data: string): void;
	close(): void;
}

export interface AttachTty {
	writeOutput(bytes: Uint8Array): void;
}

export type DetachReason =
	| { kind: "user" }
	| { kind: "server-exit"; exitCode: number; signal: number }
	| { kind: "server-error"; message: string }
	| { kind: "socket-closed"; code: number; reason: string };

export interface AttachBridgeCallbacks {
	/** Fired exactly once, however the session ends. */
	onDetach: (reason: DetachReason) => void;
	/** A non-fatal status line worth surfacing (e.g. the session's title). */
	onStatus?: (line: string) => void;
}

/** Parsed `TerminalServerMessage` shapes this bridge understands. Unknown
 * `type` values are ignored — forward compatible with server messages this
 * attach client has no use for. */
type ServerMessage =
	| { type: "attached"; terminalId: string }
	| { type: "title"; title: string | null }
	| { type: "error"; message: string; code?: string }
	| { type: "exit"; exitCode: number; signal: number }
	| { type: string; [key: string]: unknown };

export class TerminalAttachBridge {
	private detached = false;

	constructor(
		private readonly socket: AttachSocket,
		private readonly tty: AttachTty,
		private readonly callbacks: AttachBridgeCallbacks,
	) {}

	/** Route one chunk of local keyboard/paste input. Splits off and consumes
	 * a detach byte if present; everything before it is still forwarded. */
	handleTtyInput(text: string): void {
		if (this.detached) return;
		const idx = text.indexOf(DETACH_BYTE);
		const beforeDetach = idx === -1 ? text : text.slice(0, idx);
		if (beforeDetach.length > 0) {
			this.socket.send(JSON.stringify({ type: "input", data: beforeDetach }));
		}
		if (idx !== -1) this.finish({ kind: "user" });
	}

	handleTtyResize(cols: number, rows: number): void {
		if (this.detached) return;
		this.socket.send(JSON.stringify({ type: "resize", cols, rows }));
	}

	/** Route one WebSocket message: binary frames are PTY output bytes; text
	 * frames are JSON control messages. */
	handleSocketMessage(data: string | ArrayBuffer | Uint8Array): void {
		if (this.detached) return;
		if (typeof data === "string") {
			this.handleControlMessage(data);
			return;
		}
		const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
		this.tty.writeOutput(bytes);
	}

	handleSocketClose(code: number, reason: string): void {
		this.finish({ kind: "socket-closed", code, reason });
	}

	private handleControlMessage(raw: string): void {
		let message: ServerMessage;
		try {
			message = JSON.parse(raw) as ServerMessage;
		} catch {
			return;
		}
		switch (message.type) {
			case "title": {
				const title = (message as { title: string | null }).title;
				if (title) this.callbacks.onStatus?.(`title: ${title}`);
				return;
			}
			case "error": {
				const { message: text } = message as { message: string };
				this.finish({ kind: "server-error", message: text });
				return;
			}
			case "exit": {
				const { exitCode, signal } = message as {
					exitCode: number;
					signal: number;
				};
				this.finish({ kind: "server-exit", exitCode, signal });
				return;
			}
			default:
				return;
		}
	}

	private finish(reason: DetachReason): void {
		if (this.detached) return;
		this.detached = true;
		try {
			this.socket.close();
		} catch {}
		this.callbacks.onDetach(reason);
	}
}

/** Initial handshake messages an attaching client sends right after open —
 * registers this client as visible/focused (so it counts toward PTY sizing)
 * and reports its starting size. */
export function buildAttachHandshake(cols: number, rows: number): string[] {
	return [
		JSON.stringify({ type: "focus", focused: true }),
		JSON.stringify({ type: "visible", visible: true }),
		JSON.stringify({ type: "resize", cols, rows }),
	];
}
