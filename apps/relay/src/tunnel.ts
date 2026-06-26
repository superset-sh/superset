import { createApiClient } from "./api-client";
import * as directory from "./directory";
import { env } from "./env";
import type { TunnelHttpResponse, TunnelRequest } from "./types";
import { TRPCClientError } from "@trpc/client";

type WsSocket = {
	send: (data: string | ArrayBuffer | Uint8Array<ArrayBuffer>) => void;
	readyState: number;
	close: (code?: number, reason?: string) => void;
};

const PING_INTERVAL_MS = 30_000;
const PING_TIMEOUT_MISSED = 3;
const ONLINE_DEBOUNCE_MS = 250;
const SET_ONLINE_RETRY_BASE_MS = 500;
const SET_ONLINE_RETRY_MAX_MS = 8_000;
const SET_ONLINE_MAX_ATTEMPTS = 3;
const MAX_PENDING_REQUESTS_PER_TUNNEL = 1_000;

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

interface DrainOptions {
	reason?: string;
	clearDirectory: () => Promise<number>;
}

export class TunnelManager {
	private readonly tunnels = new Map<string, TunnelState>();
	private readonly requestTimeoutMs: number;
	private readonly onlineState = new Map<string, boolean>();
	private readonly onlineDebounce = new Map<
		string,
		ReturnType<typeof setTimeout>
	>();
	private readonly onlineWriteVersions = new Map<string, number>();
	private draining = false;

	constructor(requestTimeoutMs = 30_000) {
		this.requestTimeoutMs = requestTimeoutMs;
	}

	async register(hostId: string, token: string, ws: WsSocket): Promise<void> {
		if (this.draining) {
			ws.close(TunnelManager.WS_CLOSE_DRAIN, "Server draining for deploy");
			return;
		}

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
		if (ws.readyState !== 1 || this.draining) {
			await directory
				.unregister(hostId, env.FLY_REGION, env.FLY_MACHINE_ID)
				.catch((err) => {
					console.error("[relay] directory.unregister rollback failed", err);
				});
			if (this.draining) {
				ws.close(TunnelManager.WS_CLOSE_DRAIN, "Server draining for deploy");
			}
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

	// Application-defined WS close code (4xxx range) signaling "relay is
	// draining for a deploy — reconnect immediately." Distinct from 1001
	// ("Going Away") which the ping-timeout / dispose paths use; the host
	// resets its backoff only on this code, so a mass ping-timeout doesn't
	// trigger a thundering-herd of fast reconnects.
	static readonly WS_CLOSE_DRAIN = 4001;

	// SIGTERM-driven graceful drain. Closes every open tunnel with the
	// app-defined "drain" close code so the host-service can recognize this
	// as a deploy drain (not a hard disconnect or ping timeout) and
	// reconnect immediately. Called from the SIGINT/SIGTERM handler in
	// index.ts.
	//
	// Owns directory cleanup directly instead of relying on websocket close
	// callbacks. The process exits immediately after drain, so fire-and-forget
	// unregister work from onClose is not a reliable shutdown primitive.
	async drain(options: DrainOptions): Promise<number> {
		this.draining = true;
		const reason = options.reason ?? "Server draining for deploy";
		const tunnels = Array.from(this.tunnels.values());
		console.log(`[relay] draining ${tunnels.length} tunnels`);
		// In-band drain signal first: send a JSON {type:"drain"} message on
		// the WS message channel before closing. Game-day testing showed
		// the WS close frame doesn't reliably reach the host within Fly's
		// kill_timeout window (host's TCP socket sees ESTABLISHED with no
		// onclose for 75+ seconds, until its watchdog fires). The message
		// channel is already exercised by ping/pong every 30s, so we know
		// it flushes cleanly. Host's onmessage handler triggers a clean
		// reconnect on receipt; the WS close after is just belt-and-
		// suspenders.
		for (const tunnel of tunnels) {
			try {
				this.send(tunnel.ws, { type: "drain", reason });
			} catch {
				// best-effort
			}
		}
		// Give the message frames a moment to reach the host before we
		// start closing the underlying sockets.
		await new Promise((resolve) => setTimeout(resolve, 500));

		let cleared = 0;
		let clearError: unknown;
		try {
			cleared = await options.clearDirectory();
		} catch (err) {
			clearError = err;
		}

		for (const tunnel of tunnels) {
			this.disposeTunnel(tunnel, reason, TunnelManager.WS_CLOSE_DRAIN);
			this.tunnels.delete(tunnel.hostId);
		}

		// Brief tail wait so the close-handshake gets a chance to complete
		// before the process exits and RSTs the underlying TCP.
		const WS_CLOSED = 3;
		const deadline = Date.now() + 1_500;
		while (Date.now() < deadline) {
			if (tunnels.every((t) => t.ws.readyState === WS_CLOSED)) break;
			await new Promise((resolve) => setTimeout(resolve, 50));
		}
		if (clearError) throw clearError;
		return cleared;
	}

	private disposeTunnel(
		tunnel: TunnelState,
		reason: string,
		tunnelCloseCode = 1000,
	): void {
		if (tunnel.pingTimer) clearInterval(tunnel.pingTimer);

		for (const [, pending] of tunnel.pendingRequests) {
			clearTimeout(pending.timer);
			pending.reject(new Error(reason));
		}

		for (const [, clientWs] of tunnel.activeChannels) {
			clientWs.close(1001, reason);
		}

		try {
			tunnel.ws.close(tunnelCloseCode, reason);
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
			this.onlineWriteVersions.set(
				hostId,
				(this.onlineWriteVersions.get(hostId) ?? 0) + 1,
			);
			return;
		}
		const pending = this.onlineDebounce.get(hostId);
		if (pending) clearTimeout(pending);
		const version = (this.onlineWriteVersions.get(hostId) ?? 0) + 1;
		this.onlineWriteVersions.set(hostId, version);
		const timer = setTimeout(() => {
			this.onlineDebounce.delete(hostId);
			void this.attemptOnlineWrite(hostId, token, isOnline, version);
		}, ONLINE_DEBOUNCE_MS);
		this.onlineDebounce.set(hostId, timer);
	}

	private async attemptOnlineWrite(
		hostId: string,
		token: string,
		isOnline: boolean,
		version: number,
	): Promise<void> {
		for (let attempt = 0; attempt < SET_ONLINE_MAX_ATTEMPTS; attempt++) {
			if (this.onlineWriteVersions.get(hostId) !== version) return;
			try {
				await createApiClient(token).host.setOnline.mutate({
					hostId,
					isOnline,
				});
				if (this.onlineWriteVersions.get(hostId) !== version) return;
				if (isOnline) {
					this.onlineState.set(hostId, true);
				} else {
					this.onlineState.delete(hostId);
				}
				if (this.onlineWriteVersions.get(hostId) === version) {
					this.onlineWriteVersions.delete(hostId);
				}
				return;
			} catch (err) {
				if (this.onlineWriteVersions.get(hostId) !== version) return;
				// Token is invalid — retrying won't help; bail immediately.
				if (
					err instanceof TRPCClientError &&
					err.data?.httpStatus === 401
				) {
					console.warn(
						`[relay] setOnline(${isOnline}) UNAUTHORIZED for ${hostId} — token expired, skipping retries`,
					);
					this.onlineState.delete(hostId);
					if (this.onlineWriteVersions.get(hostId) === version) {
						this.onlineWriteVersions.delete(hostId);
					}
					return;
				}
				if (attempt === SET_ONLINE_MAX_ATTEMPTS - 1) {
					console.error(
						`[relay] setOnline(${isOnline}) failed for ${hostId} after ${SET_ONLINE_MAX_ATTEMPTS} attempts`,
						err,
					);
					this.onlineState.delete(hostId);
					if (this.onlineWriteVersions.get(hostId) === version) {
						this.onlineWriteVersions.delete(hostId);
					}
					return;
				}
				const delay = Math.min(
					SET_ONLINE_RETRY_BASE_MS * 2 ** attempt,
					SET_ONLINE_RETRY_MAX_MS,
				);
				await new Promise((r) => setTimeout(r, delay));
			}
		}
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

		if (tunnel.pendingRequests.size >= MAX_PENDING_REQUESTS_PER_TUNNEL) {
			throw new Error("Host overloaded (pending request queue full)");
		}

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
