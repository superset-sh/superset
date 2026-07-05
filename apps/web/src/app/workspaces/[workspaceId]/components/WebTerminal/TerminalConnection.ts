import { getAuthToken } from "../../../../../trpc/auth-token";
import { getRelayUrl } from "../../../../../trpc/relay-url";

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

const BASE_RECONNECT_DELAY_MS = 500;
const MAX_RECONNECT_DELAY_MS = 10_000;
const MAX_RECONNECT_ATTEMPTS = 12;

// Owns the terminal WebSocket lifecycle: exponential-backoff reconnect on an
// unexpected close, plus page-visibility recovery. Mobile browsers freeze
// backgrounded tabs and drop the socket; the visibility, pageshow, resume and
// online listeners reconnect the moment the page comes back. The server keys
// sessions by terminalId and adopts/respawns the PTY on reattach, so reopening
// the same URL resumes the session.
export class TerminalConnection {
	private readonly target: TerminalConnectionTarget;
	private readonly handlers: TerminalConnectionHandlers;
	private socket: WebSocket | null = null;
	private state: TerminalConnectionState = "connecting";
	private generation = 0;
	private reconnectAttempt = 0;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private hasReceivedBytes = false;
	private everAttached = false;
	private terminated = false;
	private disposed = false;

	constructor(
		target: TerminalConnectionTarget,
		handlers: TerminalConnectionHandlers,
	) {
		this.target = target;
		this.handlers = handlers;
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
		void this.connect();
	}

	dispose() {
		this.disposed = true;
		this.cancelReconnect();
		if (typeof document !== "undefined") {
			document.removeEventListener("visibilitychange", this.handleResume);
			document.removeEventListener("resume", this.handleResume);
		}
		if (typeof window !== "undefined") {
			window.removeEventListener("pageshow", this.handleResume);
			window.removeEventListener("online", this.handleResume);
		}
		this.teardownSocket();
	}

	send(message: TerminalClientMessage) {
		const socket = this.socket;
		if (!socket || socket.readyState !== WebSocket.OPEN) return;
		socket.send(JSON.stringify(message));
	}

	private connect = async () => {
		if (this.disposed || this.terminated) return;
		this.cancelReconnect();
		this.teardownSocket();
		const generation = ++this.generation;
		this.emitState(this.everAttached ? "reconnecting" : "connecting");

		let url: string;
		try {
			url = await this.buildUrl();
		} catch {
			if (generation !== this.generation || this.disposed) return;
			this.scheduleReconnect();
			return;
		}
		if (generation !== this.generation || this.disposed || this.terminated) {
			return;
		}

		let socket: WebSocket;
		try {
			socket = new WebSocket(url);
		} catch {
			this.scheduleReconnect();
			return;
		}
		socket.binaryType = "arraybuffer";
		this.socket = socket;
		this.attachListeners(socket);
	};

	private async buildUrl(): Promise<string> {
		const token = await getAuthToken();
		const base = getRelayUrl().replace(/^http/, "ws").replace(/\/$/, "");
		const url = new URL(
			`${base}/hosts/${this.target.routingKey}/terminal/${encodeURIComponent(
				this.target.terminalId,
			)}`,
		);
		url.searchParams.set("workspaceId", this.target.workspaceId);
		url.searchParams.set("themeType", "dark");
		url.searchParams.set("token", token);
		// Once xterm holds scrollback, skip the daemon ring-buffer re-dump on
		// reattach; the in-memory buffer still replays output missed offline.
		if (this.hasReceivedBytes) url.searchParams.set("replay", "0");
		return url.toString();
	}

	private attachListeners(socket: WebSocket) {
		socket.onmessage = (event) => {
			if (this.socket !== socket) return;
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
				this.reconnectAttempt = 0;
				this.everAttached = true;
			} else if (message.type === "exit" || message.type === "error") {
				this.terminated = true;
				this.cancelReconnect();
			}
			this.handlers.onControl(message);
		};

		socket.onclose = () => {
			if (this.socket !== socket) return;
			this.socket = null;
			if (this.terminated || this.disposed) return;
			this.scheduleReconnect();
		};
	}

	private teardownSocket() {
		const socket = this.socket;
		this.socket = null;
		if (!socket) return;
		socket.onmessage = null;
		socket.onclose = null;
		try {
			socket.close();
		} catch {
			// best-effort
		}
	}

	private scheduleReconnect() {
		if (this.reconnectTimer !== null) return;
		if (this.terminated || this.disposed) return;
		if (this.reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
			this.emitState("error");
			return;
		}
		this.emitState("reconnecting");
		// Frozen tabs don't run timers; the visibility listener reconnects on
		// resume instead of burning the attempt budget on a timer that won't fire.
		if (typeof document !== "undefined" && document.hidden) return;

		const delay = Math.min(
			BASE_RECONNECT_DELAY_MS * 2 ** this.reconnectAttempt,
			MAX_RECONNECT_DELAY_MS,
		);
		this.reconnectAttempt += 1;
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			void this.connect();
		}, delay);
	}

	private cancelReconnect() {
		if (this.reconnectTimer !== null) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
	}

	private handleResume = () => {
		if (this.disposed || this.terminated) return;
		if (typeof document !== "undefined" && document.hidden) return;
		this.reconnectAttempt = 0;
		const socket = this.socket;
		if (
			socket &&
			(socket.readyState === WebSocket.OPEN ||
				socket.readyState === WebSocket.CONNECTING)
		) {
			return;
		}
		this.cancelReconnect();
		void this.connect();
	};

	private emitState(state: TerminalConnectionState) {
		if (this.state === state) return;
		this.state = state;
		this.handlers.onStateChange(state);
	}
}
