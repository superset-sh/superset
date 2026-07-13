import {
	createRelaySocket,
	type RelaySocket,
} from "@superset/workspace-client/relay-socket";

export type TerminalConnectionState = "connecting" | "reconnecting" | "error";

type TerminalServerMessage =
	| { type: "attached"; terminalId: string }
	| { type: "title"; title: string | null }
	| { type: "error"; message: string }
	| { type: "exit"; exitCode: number; signal: number };

export type TerminalControlMessage = TerminalServerMessage;

type TerminalClientMessage =
	| { type: "input"; data: string }
	| { type: "resize"; cols: number; rows: number };

interface TerminalConnectionTarget {
	workspaceId: string;
	terminalId: string;
	routingKey: string;
}

interface TerminalConnectionHandlers {
	onBinary: (bytes: Uint8Array) => void;
	onControl: (message: TerminalControlMessage) => void;
	onStateChange: (state: TerminalConnectionState) => void;
}

// Environment wiring injected by the caller so this class stays free of
// env/posthog module-scope imports (and unit-testable).
interface TerminalConnectionDeps {
	getToken: () => Promise<string>;
	relayUrl: () => string;
}

const BASE_RECONNECT_DELAY_MS = 500;
const MAX_RECONNECT_DELAY_MS = 10_000;
const MAX_RECONNECT_ATTEMPTS = 12;

// Owns the terminal WebSocket lifecycle on top of createRelaySocket, which
// re-signs the URL with a fresh token and runs the relay preflight before
// every attempt. Mobile browsers freeze backgrounded tabs and drop the
// socket; the visibility, pageshow, resume and online listeners reconnect
// the moment the page comes back. The server keys sessions by terminalId and
// adopts/respawns the PTY on reattach, so reopening the same URL resumes the
// session.
export class TerminalConnection {
	private readonly target: TerminalConnectionTarget;
	private readonly handlers: TerminalConnectionHandlers;
	private readonly deps: TerminalConnectionDeps;
	private socket: RelaySocket | null = null;
	private state: TerminalConnectionState = "connecting";
	private failedAttempts = 0;
	private hasReceivedBytes = false;
	private everAttached = false;
	private terminated = false;
	private disposed = false;

	constructor(
		target: TerminalConnectionTarget,
		handlers: TerminalConnectionHandlers,
		deps: TerminalConnectionDeps,
	) {
		this.target = target;
		this.handlers = handlers;
		this.deps = deps;
	}

	start() {
		if (typeof document !== "undefined") {
			document.addEventListener("visibilitychange", this.handleResume);
			document.addEventListener("resume", this.handleResume);
		}
		if (typeof window !== "undefined") {
			window.addEventListener("pageshow", this.handleResume);
			window.addEventListener("online", this.handleResume);
		}

		const socket = createRelaySocket({
			name: "web-terminal",
			buildUrl: () => this.buildUrl(),
			getToken: () => this.deps.getToken(),
			// Definitive access denial: retrying can't change the answer.
			onAccessDenied: () => {
				this.terminated = true;
				this.emitState("error");
			},
			minReconnectionDelay: BASE_RECONNECT_DELAY_MS,
			maxReconnectionDelay: MAX_RECONNECT_DELAY_MS,
			maxEnqueuedMessages: 0,
		});
		socket.binaryType = "arraybuffer";
		this.socket = socket;

		socket.addEventListener("message", (event) => {
			if (event.data instanceof ArrayBuffer) {
				this.hasReceivedBytes = true;
				this.handlers.onBinary(new Uint8Array(event.data));
				return;
			}
			let message: TerminalServerMessage;
			try {
				message = JSON.parse(String(event.data)) as TerminalServerMessage;
			} catch {
				return;
			}
			if (message.type === "attached") {
				this.failedAttempts = 0;
				this.everAttached = true;
			} else if (message.type === "exit" || message.type === "error") {
				// Server closes after these; reconnecting would just repeat them.
				this.terminated = true;
				socket.close();
			}
			this.handlers.onControl(message);
		});

		socket.addEventListener("close", () => {
			if (this.terminated || this.disposed) return;
			// Frozen tabs don't count against the attempt budget; the visibility
			// listener resets and reconnects on resume.
			if (typeof document !== "undefined" && document.hidden) return;
			this.failedAttempts += 1;
			if (this.failedAttempts >= MAX_RECONNECT_ATTEMPTS) {
				this.emitState("error");
				socket.close();
				return;
			}
			this.emitState(this.everAttached ? "reconnecting" : "connecting");
		});
	}

	dispose() {
		this.disposed = true;
		if (typeof document !== "undefined") {
			document.removeEventListener("visibilitychange", this.handleResume);
			document.removeEventListener("resume", this.handleResume);
		}
		if (typeof window !== "undefined") {
			window.removeEventListener("pageshow", this.handleResume);
			window.removeEventListener("online", this.handleResume);
		}
		this.socket?.close();
		this.socket = null;
	}

	send(message: TerminalClientMessage) {
		const socket = this.socket;
		if (!socket || socket.readyState !== WebSocket.OPEN) return;
		socket.send(JSON.stringify(message));
	}

	private async buildUrl(): Promise<string> {
		const base = this.deps.relayUrl().replace(/\/$/, "");
		const url = new URL(
			`${base}/hosts/${this.target.routingKey}/terminal/${encodeURIComponent(
				this.target.terminalId,
			)}`,
		);
		url.searchParams.set("workspaceId", this.target.workspaceId);
		url.searchParams.set("themeType", "dark");
		// Once xterm holds scrollback, skip the daemon ring-buffer re-dump on
		// reattach; the in-memory buffer still replays output missed offline.
		if (this.hasReceivedBytes) url.searchParams.set("replay", "0");
		return url.toString();
	}

	private handleResume = () => {
		if (this.disposed || this.terminated) return;
		if (typeof document !== "undefined" && document.hidden) return;
		this.failedAttempts = 0;
		const socket = this.socket;
		if (!socket) return;
		if (
			socket.readyState === WebSocket.OPEN ||
			socket.readyState === WebSocket.CONNECTING
		) {
			return;
		}
		this.emitState(this.everAttached ? "reconnecting" : "connecting");
		// Resets partysocket's retry counter and dials immediately — also the
		// recovery path after the attempt budget closed the socket.
		socket.reconnect();
	};

	private emitState(state: TerminalConnectionState) {
		if (this.state === state) return;
		this.state = state;
		this.handlers.onStateChange(state);
	}
}
