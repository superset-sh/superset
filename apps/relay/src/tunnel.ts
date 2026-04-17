import { createApiClient } from "./api-client";
import type { TunnelHttpResponse, TunnelRequest } from "./types";

type WsSocket = {
	send: (data: string) => void;
	readyState: number;
	close: (code?: number, reason?: string) => void;
};

const PING_INTERVAL_MS = 30_000;
const PING_TIMEOUT_MISSED = 3;

interface PendingRequest {
	resolve: (response: TunnelHttpResponse) => void;
	reject: (error: Error) => void;
	timer: ReturnType<typeof setTimeout>;
}

interface TunnelState {
	hostId: string;
	token: string;
	ws: WsSocket;
	pendingRequests: Map<string, PendingRequest>;
	activeChannels: Map<string, WsSocket>;
	pingTimer: ReturnType<typeof setInterval> | null;
	missedPings: number;
}

export class TunnelManager {
	private readonly tunnels = new Map<string, TunnelState>();
	private readonly requestTimeoutMs: number;

	constructor(requestTimeoutMs = 30_000) {
		this.requestTimeoutMs = requestTimeoutMs;
	}

	register(hostId: string, token: string, ws: WsSocket): void {
		if (this.tunnels.has(hostId)) {
			ws.close(1000, "Tunnel already registered");
			return;
		}

		const tunnel: TunnelState = {
			hostId,
			token,
			ws,
			pendingRequests: new Map(),
			activeChannels: new Map(),
			pingTimer: null,
			missedPings: 0,
		};

		this.tunnels.set(hostId, tunnel);

		tunnel.pingTimer = setInterval(() => {
			tunnel.missedPings++;
			if (tunnel.missedPings >= PING_TIMEOUT_MISSED) {
				ws.close(1001, "Ping timeout");
				return;
			}
			this.send(ws, { type: "ping" });
		}, PING_INTERVAL_MS);

		void createApiClient(token)
			.device.setHostOnline.mutate({ hostId, isOnline: true })
			.catch(() => {});
		console.log(`[relay] tunnel registered: ${hostId}`);
	}

	unregister(hostId: string): void {
		const tunnel = this.tunnels.get(hostId);
		if (!tunnel) return;

		if (tunnel.pingTimer) clearInterval(tunnel.pingTimer);

		for (const [, pending] of tunnel.pendingRequests) {
			clearTimeout(pending.timer);
			pending.reject(new Error("Tunnel disconnected"));
		}

		for (const [, clientWs] of tunnel.activeChannels) {
			clientWs.close(1001, "Tunnel disconnected");
		}

		void createApiClient(tunnel.token)
			.device.setHostOnline.mutate({ hostId, isOnline: false })
			.catch(() => {});
		this.tunnels.delete(hostId);
		console.log(`[relay] tunnel unregistered: ${hostId}`);
	}

	hasTunnel(hostId: string): boolean {
		return this.tunnels.has(hostId);
	}

	async sendHttpRequest(
		hostId: string,
		req: {
			method: string;
			path: string;
			headers: Record<string, string>;
			body?: string;
		},
	): Promise<TunnelHttpResponse> {
		const tunnel = this.tunnels.get(hostId);
		if (!tunnel) throw new Error("Host not connected");

		const id = crypto.randomUUID();

		return new Promise<TunnelHttpResponse>((resolve, reject) => {
			const timer = setTimeout(() => {
				tunnel.pendingRequests.delete(id);
				reject(new Error("Request timed out"));
			}, this.requestTimeoutMs);

			tunnel.pendingRequests.set(id, { resolve, reject, timer });
			this.send(tunnel.ws, {
				type: "http",
				id,
				method: req.method,
				path: req.path,
				headers: req.headers,
				body: req.body,
			});
		});
	}

	openWsChannel(
		hostId: string,
		path: string,
		query: string | undefined,
		clientWs: WsSocket,
	): string {
		const tunnel = this.tunnels.get(hostId);
		if (!tunnel) throw new Error("Host not connected");

		const id = crypto.randomUUID();
		tunnel.activeChannels.set(id, clientWs);
		this.send(tunnel.ws, { type: "ws:open", id, path, query });
		return id;
	}

	sendWsFrame(hostId: string, channelId: string, data: string): void {
		const tunnel = this.tunnels.get(hostId);
		if (tunnel) this.send(tunnel.ws, { type: "ws:frame", id: channelId, data });
	}

	closeWsChannel(hostId: string, channelId: string, code?: number): void {
		const tunnel = this.tunnels.get(hostId);
		if (!tunnel) return;
		tunnel.activeChannels.delete(channelId);
		this.send(tunnel.ws, { type: "ws:close", id: channelId, code });
	}

	handleMessage(hostId: string, data: unknown): void {
		const tunnel = this.tunnels.get(hostId);
		if (!tunnel) return;

		let msg: { type: string; [key: string]: unknown };
		try {
			msg = JSON.parse(String(data));
		} catch {
			return;
		}

		if (msg.type === "pong") {
			tunnel.missedPings = 0;
		} else if (msg.type === "http:response") {
			const pending = tunnel.pendingRequests.get(msg.id as string);
			if (pending) {
				clearTimeout(pending.timer);
				tunnel.pendingRequests.delete(msg.id as string);
				pending.resolve(msg as unknown as TunnelHttpResponse);
			}
		} else if (msg.type === "ws:frame") {
			const clientWs = tunnel.activeChannels.get(msg.id as string);
			if (clientWs?.readyState === 1) clientWs.send(msg.data as string);
		} else if (msg.type === "ws:close") {
			const clientWs = tunnel.activeChannels.get(msg.id as string);
			if (clientWs) {
				tunnel.activeChannels.delete(msg.id as string);
				clientWs.close((msg.code as number) ?? 1000);
			}
		}
	}

	private send(
		ws: WsSocket,
		message: TunnelRequest | Record<string, unknown>,
	): void {
		if (ws.readyState === 1) ws.send(JSON.stringify(message));
	}
}
