import { createApiClient } from "./api-client";
import * as directory from "./directory";
import { env } from "./env";
import type { TunnelHttpResponse, TunnelRequest } from "./types";

type WsSocket = {
	send: (data: string | ArrayBuffer | Uint8Array<ArrayBuffer>) => void;
	readyState: number;
	close: (code?: number, reason?: string) => void;
};

const PING_INTERVAL_MS = 30_000;
const PING_TIMEOUT_MISSED = 3;
const ONLINE_DEBOUNCE_MS = 250;
const FLAP_THRESHOLD_MS = 5_000;
const FLAP_BUFFER_MAX = 200;

interface FlapEvent {
	hostId: string;
	registeredAt: number;
	unregisteredAt: number;
	lifetimeMs: number;
}

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
	registeredAt: number;
}

export class TunnelManager {
	private readonly tunnels = new Map<string, TunnelState>();
	private readonly requestTimeoutMs: number;
	private readonly onlineState = new Map<string, boolean>();
	private readonly onlineDebounce = new Map<
		string,
		ReturnType<typeof setTimeout>
	>();
	private readonly flapBuffer: FlapEvent[] = [];

	constructor(requestTimeoutMs = 30_000) {
		this.requestTimeoutMs = requestTimeoutMs;
	}

	register(hostId: string, token: string, ws: WsSocket): void {
		// Last-write-wins: close the old socket so flaky clients don't get
		// stuck behind a dead-but-not-yet-detected WS.
		const existing = this.tunnels.get(hostId);
		if (existing) {
			console.log(
				`[relay] tunnel re-register: closing old socket for ${hostId}`,
			);
			this.disposeTunnel(existing, "Replaced by new tunnel");
			this.tunnels.delete(hostId);
		}

		const now = Date.now();
		const tunnel: TunnelState = {
			hostId,
			token,
			ws,
			pendingRequests: new Map(),
			activeChannels: new Map(),
			pingTimer: null,
			missedPings: 0,
			registeredAt: now,
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

		void directory
			.register(hostId, env.FLY_REGION, env.FLY_MACHINE_ID)
			.catch((err) => {
				console.error("[relay] directory.register failed", err);
			});
		this.scheduleOnlineWrite(hostId, token, true);
		console.log(`[relay] tunnel registered: ${hostId}`);
	}

	unregister(hostId: string, ws?: WsSocket): void {
		const tunnel = this.tunnels.get(hostId);
		if (!tunnel) return;
		// If a specific socket was passed, only unregister when it's still the
		// active one. Prevents the close handler of a just-disposed old socket
		// from tearing down a freshly-registered new tunnel.
		if (ws && tunnel.ws !== ws) return;

		const lifetimeMs = Date.now() - tunnel.registeredAt;
		if (lifetimeMs < FLAP_THRESHOLD_MS) {
			this.recordFlap({
				hostId,
				registeredAt: tunnel.registeredAt,
				unregisteredAt: Date.now(),
				lifetimeMs,
			});
		}

		this.disposeTunnel(tunnel, "Tunnel disconnected");
		this.tunnels.delete(hostId);

		void directory
			.unregister(hostId, env.FLY_REGION, env.FLY_MACHINE_ID)
			.catch((err) => {
				console.error("[relay] directory.unregister failed", err);
			});
		this.scheduleOnlineWrite(hostId, tunnel.token, false);
		console.log(`[relay] tunnel unregistered: ${hostId}`);
	}

	private disposeTunnel(tunnel: TunnelState, reason: string): void {
		if (tunnel.pingTimer) clearInterval(tunnel.pingTimer);

		for (const [, pending] of tunnel.pendingRequests) {
			clearTimeout(pending.timer);
			pending.reject(new Error(reason));
		}

		for (const [, clientWs] of tunnel.activeChannels) {
			clientWs.close(1001, reason);
		}

		try {
			tunnel.ws.close(1000, reason);
		} catch {
			// already closed
		}
	}

	private scheduleOnlineWrite(
		hostId: string,
		token: string,
		isOnline: boolean,
	): void {
		// Debounce + drop redundant writes so flapping reconnects don't spam the API.
		if (this.onlineState.get(hostId) === isOnline) {
			const pending = this.onlineDebounce.get(hostId);
			if (pending) {
				clearTimeout(pending);
				this.onlineDebounce.delete(hostId);
			}
			return;
		}
		const pending = this.onlineDebounce.get(hostId);
		if (pending) clearTimeout(pending);
		const timer = setTimeout(() => {
			this.onlineDebounce.delete(hostId);
			if (this.onlineState.get(hostId) === isOnline) return;
			this.onlineState.set(hostId, isOnline);
			void createApiClient(token)
				.host.setOnline.mutate({ hostId, isOnline })
				.catch((err) => {
					console.error("[relay] setOnline mutate failed", err);
				});
			// Drop the entry after a definitive offline write so onlineState
			// doesn't accumulate one boolean per historical hostId.
			if (!isOnline) this.onlineState.delete(hostId);
		}, ONLINE_DEBOUNCE_MS);
		this.onlineDebounce.set(hostId, timer);
	}

	private recordFlap(flap: FlapEvent): void {
		this.flapBuffer.push(flap);
		if (this.flapBuffer.length > FLAP_BUFFER_MAX) {
			this.flapBuffer.splice(0, this.flapBuffer.length - FLAP_BUFFER_MAX);
		}
	}

	getRecentFlaps(sinceMs: number): FlapEvent[] {
		const cutoff = Date.now() - sinceMs;
		return this.flapBuffer.filter((f) => f.unregisteredAt >= cutoff);
	}

	getActiveTunnels(): {
		hostId: string;
		registeredAt: number;
		pendingRequests: number;
		activeChannels: number;
	}[] {
		return Array.from(this.tunnels.values()).map((t) => ({
			hostId: t.hostId,
			registeredAt: t.registeredAt,
			pendingRequests: t.pendingRequests.size,
			activeChannels: t.activeChannels.size,
		}));
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
			void directory.heartbeat(hostId).catch(() => {});
		} else if (msg.type === "http:response") {
			const pending = tunnel.pendingRequests.get(msg.id as string);
			if (pending) {
				clearTimeout(pending.timer);
				tunnel.pendingRequests.delete(msg.id as string);
				pending.resolve(msg as unknown as TunnelHttpResponse);
			}
		} else if (msg.type === "ws:frame") {
			if (typeof msg.data !== "string") return;
			const clientWs = tunnel.activeChannels.get(msg.id as string);
			if (clientWs?.readyState === 1) {
				if (msg.encoding === "base64") {
					clientWs.send(Buffer.from(msg.data, "base64"));
				} else {
					clientWs.send(msg.data);
				}
			}
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
