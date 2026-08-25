import type { Duplex } from "node:stream";
import type { ForwardTarget } from "shared/types";
import { createWebSocketStream, WebSocket } from "ws";
import type { ForwardTransport } from "./types";

const OPEN_TIMEOUT_MS = 15_000;

export interface RelayForwardTransportOptions {
	getToken: () => string | null;
	fetchFn?: typeof fetch;
}

/**
 * Forwards over relay2's per-stream dial-back: the desktop upgrades
 * `/hosts/<key>/tcp/<port>` on the relay, the host dials back, and the relay
 * splices frames verbatim. Only protocol v2 relays can carry binary client
 * frames, so the probe refuses v1 (`/health` without `proto: 2`).
 */
export class RelayForwardTransport implements ForwardTransport {
	readonly kind = "relay" as const;
	private readonly probes = new Map<string, Promise<void>>();

	constructor(private readonly options: RelayForwardTransportOptions) {}

	probe({ hostUrl }: Pick<ForwardTarget, "hostUrl">): Promise<void> {
		const origin = new URL(hostUrl).origin;
		let pending = this.probes.get(origin);
		if (!pending) {
			pending = this.checkProtocol(origin).catch((err) => {
				// Let a transient failure retry on the next sync.
				this.probes.delete(origin);
				throw err;
			});
			this.probes.set(origin, pending);
		}
		return pending;
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
		const token = this.options.getToken();
		if (!token) throw new Error("Not signed in");
		const url = new URL(`${target.hostUrl}/tcp/${target.remotePort}`);
		if (url.protocol === "http:") url.protocol = "ws:";
		if (url.protocol === "https:") url.protocol = "wss:";
		url.searchParams.set("workspaceId", target.workspaceId);
		url.searchParams.set("token", token);

		const ws = new WebSocket(url.toString());
		await new Promise<void>((resolve, reject) => {
			const timer = setTimeout(() => {
				ws.terminate();
				reject(new Error("Relay did not answer"));
			}, OPEN_TIMEOUT_MS);
			ws.once("open", () => {
				clearTimeout(timer);
				resolve();
			});
			ws.once("unexpected-response", (_req, res) => {
				clearTimeout(timer);
				reject(new Error(describeUpgradeFailure(res.statusCode)));
			});
			ws.once("error", (err) => {
				clearTimeout(timer);
				reject(err);
			});
		});
		return createWebSocketStream(ws);
	}
}

function describeUpgradeFailure(status: number | undefined): string {
	switch (status) {
		case 401:
			return "Session expired, sign in again";
		case 403:
			return "No access to this host";
		case 503:
			return "Host is offline";
		case 504:
			return "Host did not answer";
		default:
			return `Relay refused the stream (${status ?? "unknown"})`;
	}
}
