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
	private readonly onlineState = new Map<string, boolean>();
	private readonly onlineDebounce = new Map<
		string,
		ReturnType<typeof setTimeout>
	>();

	constructor(requestTimeoutMs = 30_000) {
		this.requestTimeoutMs = requestTimeoutMs;
	}

	async register(hostId: string, token: string, ws: WsSocket): Promise<void> {
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

		// Write directory FIRST (with bounded retries) so we never have a
		// local tunnel that's invisible to other machines. If we can't reach
		// Upstash, refuse the connection — host will reconnect.
		const directoryWritten = await this.registerDirectoryWithRetry(hostId);
		if (!directoryWritten) {
			ws.close(1011, "Directory write failed");
			return;
		}

		// The WS may have closed during the directory-write await. The
		// onClose handler in index.ts ran with registeredWs===null (since we
		// hadn't returned yet), so it skipped unregister. Roll the directory
		// entry back ourselves; otherwise other machines fly-replay traffic
		// to a dead local tunnel for ~90s until the TTL ages out.
		if (ws.readyState !== 1) {
			await directory
				.unregister(hostId, env.FLY_REGION, env.FLY_MACHINE_ID)
				.catch((err) => {
					console.error("[relay] directory.unregister rollback failed", err);
				});
			return;
		}

		// Another register() for the same hostId may have completed while we
		// were awaiting the directory write — dispose the racer so its
		// pingTimer/ws don't dangle for ~90s until missed-ping cleanup.
		const raced = this.tunnels.get(hostId);
		if (raced) {
			console.log(
				`[relay] concurrent re-register: closing raced socket for ${hostId}`,
			);
			this.disposeTunnel(raced, "Replaced by new tunnel");
			this.tunnels.delete(hostId);
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

		this.scheduleOnlineWrite(hostId, token, true);
		console.log(`[relay] tunnel registered: ${hostId}`);
	}

	private async registerDirectoryWithRetry(hostId: string): Promise<boolean> {
		const attempts = 3;
		for (let i = 0; i < attempts; i++) {
			try {
				await directory.register(hostId, env.FLY_REGION, env.FLY_MACHINE_ID);
				return true;
			} catch (err) {
				if (i === attempts - 1) {
					console.error(
						`[relay] directory.register failed after ${attempts} attempts`,
						err,
					);
					return false;
				}
				await new Promise((r) => setTimeout(r, 100 * 2 ** i));
			}
		}
		return false;
	}

	unregister(hostId: string, ws?: WsSocket): void {
		const tunnel = this.tunnels.get(hostId);
		if (!tunnel) return;
		// If a specific socket was passed, only unregister when it's still the
		// active one. Prevents the close handler of a just-disposed old socket
		// from tearing down a freshly-registered new tunnel.
		if (ws && tunnel.ws !== ws) return;

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
