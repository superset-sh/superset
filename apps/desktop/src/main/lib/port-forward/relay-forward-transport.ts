import type { Duplex } from "node:stream";
import type { ForwardTarget } from "shared/types";
import { MuxSession } from "./mux-session";
import type { ForwardTransport } from "./types";

export interface RelayForwardTransportOptions {
	getToken: () => string | null;
}

/**
 * Forwards over one mux session per (host, workspace), spliced through
 * the relay's per-stream dial-back exactly like a terminal stream. The first
 * connection after selecting a workspace pays the relay dial; every later
 * connection is an OPEN frame on the warm session.
 */
export class RelayForwardTransport implements ForwardTransport {
	readonly kind = "relay" as const;
	private readonly sessions = new Map<string, MuxSession>();

	constructor(private readonly options: RelayForwardTransportOptions) {}

	async probe(target: ForwardTarget): Promise<void> {
		// Establish the mux session now, so a host without forwarding support
		// errors the row at sync time and the first connection is one OPEN
		// frame on an already-warm pipe instead of a relay dial.
		await this.session(target).ready;
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
