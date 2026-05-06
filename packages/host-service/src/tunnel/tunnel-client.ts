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

export interface TunnelClientOptions {
	relayUrl: string;
	hostId: string;
	getAuthToken: () => Promise<string | null>;
	localPort: number;
	hostServiceSecret: string;
}

export class TunnelClient {
	private readonly relayUrl: string;
	private readonly hostId: string;
	private readonly getAuthToken: () => Promise<string | null>;
	private readonly localPort: number;
	private readonly hostServiceSecret: string;
	private socket: WebSocket | null = null;
	private localChannels = new Map<string, WebSocket>();
	private reconnectAttempts = 0;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private closed = false;

	constructor(options: TunnelClientOptions) {
		this.relayUrl = options.relayUrl;
		this.hostId = options.hostId;
		this.getAuthToken = options.getAuthToken;
		this.localPort = options.localPort;
		this.hostServiceSecret = options.hostServiceSecret;
	}

	async connect(): Promise<void> {
		if (this.closed) return;

		// An unhandled rejection here (e.g. DNS failure inside getAuthToken on
		// wake from sleep) crashes host-service and orphans every PTY.
		try {
			const token = await this.getAuthToken();
			if (!token) {
				console.warn("[host-service:tunnel] no auth token available, retrying");
				this.scheduleReconnect();
				return;
			}

			const url = new URL("/tunnel", this.relayUrl);
			url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
			url.searchParams.set("hostId", this.hostId);
			url.searchParams.set("token", token);

			const socket = new WebSocket(url.toString());
			this.socket = socket;

			socket.onopen = () => {
				this.reconnectAttempts = 0;
				console.log(
					`[host-service:tunnel] connected to relay for host ${this.hostId}`,
				);
			};

			socket.onmessage = (event) => {
				void this.handleMessage(event.data);
			};

			socket.onclose = () => {
				this.socket = null;
				this.cleanupChannels();
				if (!this.closed) {
					this.scheduleReconnect();
				}
			};

			socket.onerror = (event) => {
				console.error("[host-service:tunnel] socket error:", event);
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.error(`[host-service:tunnel] connect failed: ${message}`);
			this.socket = null;
			this.scheduleReconnect();
		}
	}

	close(): void {
		this.closed = true;
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

		this.localChannels.set(request.id, localWs);
	}

	private handleWsFrame(message: TunnelWsFrame): void {
		const localWs = this.localChannels.get(message.id);
		if (localWs?.readyState === WebSocket.OPEN) {
			localWs.send(message.data);
		}
	}

	private handleWsClose(message: TunnelWsClose): void {
		const localWs = this.localChannels.get(message.id);
		if (localWs) {
			this.localChannels.delete(message.id);
			localWs.close(message.code ?? 1000);
		}
	}

	private cleanupChannels(): void {
		for (const ws of this.localChannels.values()) {
			ws.close(1001, "Tunnel disconnected");
		}
		this.localChannels.clear();
	}

	private scheduleReconnect(): void {
		if (this.closed || this.reconnectTimer) return;

		const delay = Math.min(
			RECONNECT_BASE_MS * 2 ** this.reconnectAttempts,
			RECONNECT_MAX_MS,
		);
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
