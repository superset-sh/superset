import type {
	TunnelHttpRequest,
	TunnelRequest,
	TunnelResponse,
	TunnelWsClose,
	TunnelWsFrame,
	TunnelWsOpen,
} from "./types";

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const INBOUND_SILENCE_TIMEOUT_MS = 75_000;
const WATCHDOG_INTERVAL_MS = 10_000;
const CONNECT_TIMEOUT_MS = 20_000;

export interface TunnelClientOptions {
	relayUrl: string;
	hostId: string;
	getAuthToken: () => Promise<string | null>;
	localPort: number;
	hostServiceSecret: string;
}

interface LocalChannel {
	ws: WebSocket;
	pendingFrames: string[];
}

export class TunnelClient {
	private readonly relayUrl: string;
	private readonly hostId: string;
	private readonly getAuthToken: () => Promise<string | null>;
	private readonly localPort: number;
	private readonly hostServiceSecret: string;
	private socket: WebSocket | null = null;
	private localChannels = new Map<string, LocalChannel>();
	private reconnectAttempts = 0;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private watchdogTimer: ReturnType<typeof setInterval> | null = null;
	private lastInboundAt = 0;
	private closed = false;
	private connecting = false;

	constructor(options: TunnelClientOptions) {
		this.relayUrl = options.relayUrl;
		this.hostId = options.hostId;
		this.getAuthToken = options.getAuthToken;
		this.localPort = options.localPort;
		this.hostServiceSecret = options.hostServiceSecret;
	}

	async connect(): Promise<void> {
		if (this.closed) return;
		if (this.connecting) return;
		if (
			this.socket?.readyState === WebSocket.CONNECTING ||
			this.socket?.readyState === WebSocket.OPEN
		) {
			return;
		}
		this.connecting = true;

		let timedOut = false;
		const deadline = setTimeout(() => {
			if (this.closed) return;
			timedOut = true;
			console.warn(
				`[host-service:tunnel] connect did not complete within ${CONNECT_TIMEOUT_MS}ms, forcing retry`,
			);
			try {
				this.socket?.close(4001, "Connect timeout");
			} catch {}
			this.socket = null;
			this.connecting = false;
			this.scheduleReconnect();
		}, CONNECT_TIMEOUT_MS);

		// An unhandled rejection here (e.g. DNS failure inside getAuthToken on
		// wake from sleep) crashes host-service and orphans every PTY.
		try {
			const token = await this.getAuthToken();
			if (timedOut || this.closed) {
				clearTimeout(deadline);
				if (this.closed) this.connecting = false;
				return;
			}
			if (!token) {
				clearTimeout(deadline);
				console.warn("[host-service:tunnel] no auth token available, retrying");
				this.connecting = false;
				this.scheduleReconnect();
				return;
			}

			const url = new URL("/tunnel", this.relayUrl);
			url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
			url.searchParams.set("hostId", this.hostId);
			url.searchParams.set("token", token);

			const socket = new WebSocket(url.toString());
			this.socket = socket;
			this.lastInboundAt = Date.now();

			socket.onopen = () => {
				clearTimeout(deadline);
				this.reconnectAttempts = 0;
				this.connecting = false;
				this.lastInboundAt = Date.now();
				this.startWatchdog();
				console.log(
					`[host-service:tunnel] connected to relay for host ${this.hostId}`,
				);
			};

			socket.onmessage = (event) => {
				this.lastInboundAt = Date.now();
				void this.handleMessage(event.data);
			};

			socket.onclose = (event) => {
				if (this.socket !== socket) return;
				clearTimeout(deadline);
				try {
					this.socket = null;
					this.connecting = false;
					this.stopWatchdog();
					this.cleanupChannels();
					if (event.code === 1008) {
						console.warn(
							`[host-service:tunnel] relay rejected connection (code=${event.code}, reason=${event.reason ?? ""}); retrying`,
						);
					}
				} catch (err) {
					console.warn(
						"[host-service:tunnel] error during onclose cleanup",
						err,
					);
				} finally {
					if (!this.closed) this.scheduleReconnect();
				}
			};

			socket.onerror = (event) => {
				console.error("[host-service:tunnel] socket error:", event);
			};
		} catch (error) {
			clearTimeout(deadline);
			if (timedOut) return;
			const message = error instanceof Error ? error.message : String(error);
			console.error(`[host-service:tunnel] connect failed: ${message}`);
			this.socket = null;
			this.connecting = false;
			this.scheduleReconnect();
		}
	}

	close(): void {
		this.closed = true;
		this.stopWatchdog();
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		this.cleanupChannels();
		if (
			this.socket?.readyState === WebSocket.CONNECTING ||
			this.socket?.readyState === WebSocket.OPEN
		) {
			this.socket.close(1000, "Shutting down");
		}
		this.socket = null;
	}

	private send(message: TunnelResponse): void {
		if (this.socket?.readyState === WebSocket.OPEN) {
			this.socket.send(JSON.stringify(message));
		}
	}

	private async handleMessage(data: unknown): Promise<void> {
		let message: TunnelRequest;
		try {
			message = JSON.parse(String(data)) as TunnelRequest;
		} catch {
			return;
		}

		switch (message.type) {
			case "ping":
				this.send({ type: "pong" });
				break;
			case "http":
				await this.handleHttpRequest(message);
				break;
			case "ws:open":
				this.handleWsOpen(message);
				break;
			case "ws:frame":
				this.handleWsFrame(message);
				break;
			case "ws:close":
				this.handleWsClose(message);
				break;
		}
	}

	private async handleHttpRequest(request: TunnelHttpRequest): Promise<void> {
		try {
			const url = `http://127.0.0.1:${this.localPort}${request.path}`;
			const response = await fetch(url, {
				method: request.method,
				headers: {
					...request.headers,
					Authorization: `Bearer ${this.hostServiceSecret}`,
				},
				body: request.body ?? undefined,
			});

			const body = await response.text();
			const headers: Record<string, string> = {};
			for (const [key, value] of response.headers.entries()) {
				headers[key] = value;
			}

			this.send({
				type: "http:response",
				id: request.id,
				status: response.status,
				headers,
				body,
			});
		} catch (error) {
			console.error(
				`[host-service:tunnel] HTTP proxy failed ${request.method} ${request.path}:`,
				error,
			);
			this.send({
				type: "http:response",
				id: request.id,
				status: 502,
				headers: {},
				body: "Failed to reach local host-service",
			});
		}
	}

	private handleWsOpen(request: TunnelWsOpen): void {
		const wsUrl = new URL(request.path, `ws://127.0.0.1:${this.localPort}`);
		wsUrl.searchParams.set("token", this.hostServiceSecret);
		if (request.query) {
			const params = new URLSearchParams(request.query);
			for (const [key, value] of params) {
				if (key !== "token") {
					wsUrl.searchParams.set(key, value);
				}
			}
		}

		const localWs = new WebSocket(wsUrl.toString());
		localWs.binaryType = "arraybuffer";

		const channel: LocalChannel = {
			ws: localWs,
			pendingFrames: [],
		};

		localWs.onopen = () => {
			for (const frame of channel.pendingFrames) {
				localWs.send(frame);
			}
			channel.pendingFrames.length = 0;
		};

		localWs.onmessage = (event) => {
			const data = event.data;
			if (typeof data === "string") {
				this.send({ type: "ws:frame", id: request.id, data });
				return;
			}
			if (data instanceof ArrayBuffer) {
				this.send({
					type: "ws:frame",
					id: request.id,
					data: Buffer.from(data).toString("base64"),
					encoding: "base64",
				});
			}
		};

		localWs.onclose = (event) => {
			this.localChannels.delete(request.id);
			this.send({ type: "ws:close", id: request.id, code: event.code });
		};

		localWs.onerror = (event) => {
			// onclose always follows onerror; ws:close is sent from onclose
			console.error(
				`[host-service:tunnel] local WS error on ${request.path}`,
				event,
			);
		};

		this.localChannels.set(request.id, channel);
	}

	private handleWsFrame(message: TunnelWsFrame): void {
		const channel = this.localChannels.get(message.id);
		if (!channel) return;
		if (channel.ws.readyState === WebSocket.OPEN) {
			channel.ws.send(message.data);
			return;
		}
		if (channel.ws.readyState === WebSocket.CONNECTING) {
			if (channel.pendingFrames.length < 256) {
				channel.pendingFrames.push(message.data);
			}
		}
	}

	private handleWsClose(message: TunnelWsClose): void {
		const channel = this.localChannels.get(message.id);
		if (channel) {
			this.localChannels.delete(message.id);
			channel.ws.close(message.code ?? 1000);
		}
	}

	private cleanupChannels(): void {
		for (const channel of this.localChannels.values()) {
			try {
				channel.ws.close(1000, "Tunnel disconnected");
			} catch (err) {
				console.warn(
					"[host-service:tunnel] error closing local channel ws",
					err,
				);
			}
		}
		this.localChannels.clear();
	}

	private startWatchdog(): void {
		this.stopWatchdog();
		this.watchdogTimer = setInterval(() => {
			if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
			const silentFor = Date.now() - this.lastInboundAt;
			if (silentFor > INBOUND_SILENCE_TIMEOUT_MS) {
				console.warn(
					`[host-service:tunnel] no inbound traffic for ${silentFor}ms, forcing reconnect`,
				);
				try {
					this.socket.close(4002, "Inbound silence timeout");
				} catch {
					// already closed
				}
			}
		}, WATCHDOG_INTERVAL_MS);
	}

	private stopWatchdog(): void {
		if (this.watchdogTimer) {
			clearInterval(this.watchdogTimer);
			this.watchdogTimer = null;
		}
	}

	private scheduleReconnect(): void {
		if (this.closed || this.reconnectTimer) return;

		const baseDelay = Math.min(
			RECONNECT_BASE_MS * 2 ** this.reconnectAttempts,
			RECONNECT_MAX_MS,
		);
		const delay = Math.floor(baseDelay * (0.5 + Math.random() * 0.5));
		this.reconnectAttempts++;

		console.log(
			`[host-service:tunnel] reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`,
		);

		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			void this.connect();
		}, delay);
	}
}
