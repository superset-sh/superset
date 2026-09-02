import type { Duplex } from "node:stream";
import type { ForwardTarget } from "shared/types";
import { MuxSession } from "./mux-session";
import type { ForwardTransport } from "./types";

export interface RelayForwardTransportOptions {
	getToken: () => string | null;
	fetchFn?: (input: string) => Promise<Response>;
}

/**
 * Forwards over one mux session per (host, workspace), spliced through
 * relay2's per-stream dial-back exactly like a terminal stream. The first
 * connection after selecting a workspace pays the relay dial; every later
 * connection is an OPEN frame on the warm session. Only protocol v2 relays
 * can carry binary client frames, so the probe refuses v1 (`/health`
 * without `proto: 2`).
 */
export class RelayForwardTransport implements ForwardTransport {
	readonly kind = "relay" as const;
	private readonly probes = new Map<string, Promise<void>>();
	private readonly sessions = new Map<string, MuxSession>();

	constructor(private readonly options: RelayForwardTransportOptions) {}

	async probe(target: ForwardTarget): Promise<void> {
		const origin = new URL(target.hostUrl).origin;
		let pending = this.probes.get(origin);
		if (!pending) {
			pending = this.checkProtocol(origin).catch((err) => {
				// Let a transient failure retry on the next sync.
				this.probes.delete(origin);
				throw err;
			});
			this.probes.set(origin, pending);
		}
		await pending;
		// Establish the mux session now, so a host without forwarding support
		// errors the row at sync time and the first connection is one OPEN
		// frame on an already-warm pipe instead of a relay dial.
		await this.session(target).ready;
	}

	private async checkProtocol(origin: string): Promise<void> {
		const fetchFn = this.options.fetchFn ?? fetch;
		const res = await fetchFn(`${origin}/health`);
		if (!res.ok) throw new Error(`Relay health check failed (${res.status})`);
		const body = (await res.json()) as { proto?: number };
		if (body.proto !== 2) {
			throw new Error(
				"Host relay does not support port forwarding (protocol v1)",
			);
		}
	}

	async openStream(target: ForwardTarget): Promise<Duplex> {
		const session = this.session(target);
		await session.ready;
		return session.openStream(target.remotePort);
	}

	private session(target: ForwardTarget): MuxSession {
		const key = `${target.hostUrl}|${target.workspaceId}`;
		const existing = this.sessions.get(key);
		if (existing && !existing.isDead) return existing;

		const token = this.options.getToken();
		if (!token) throw new Error("Not signed in");
		const url = new URL(`${target.hostUrl}/fwd`);
		if (url.protocol === "http:") url.protocol = "ws:";
		if (url.protocol === "https:") url.protocol = "wss:";
		url.searchParams.set("workspaceId", target.workspaceId);
		url.searchParams.set("token", token);

		const session = new MuxSession(url.toString(), {
			onClosed: () => {
				if (this.sessions.get(key) === session) this.sessions.delete(key);
			},
		});
		this.sessions.set(key, session);
		return session;
	}
}
