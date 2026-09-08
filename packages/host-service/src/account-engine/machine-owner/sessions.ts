import type { AccountEngineHostDeps } from "../host-deps.ts";
import { observeProviderLimit } from "../provider-limit.ts";
import { type MovableSession, STALE_START_MS } from "../session-mover.ts";
import type { AccountAgent } from "../types.ts";
import type { AccountRpc } from "./rpc.ts";

export interface SessionSnapshot {
	row: MovableSession;
	busy: boolean;
	alive: boolean;
	started: boolean;
	bracketed: boolean;
}

export function snapshotSessions(
	host: AccountEngineHostDeps,
): SessionSnapshot[] {
	return (["claude", "codex"] as const).flatMap((agent) =>
		host.listSessions(agent).map((row) => ({
			row,
			busy: host.isAgentBusy(row.terminalId),
			alive: host.isTerminalAlive(row.terminalId),
			started: host.hasStartedAgent(row.terminalId, agent),
			bracketed: host.isBracketedPasteActive(row.terminalId),
		})),
	);
}

/** Read snapshots are advisory. Every destructive command checks the owning
 * org's current binding again before touching the terminal. */
export async function executeSessionCommand(
	host: AccountEngineHostDeps,
	method: string,
	args: unknown[],
	pendingResumes = new Map<string, MovableSession>(),
): Promise<unknown> {
	const expected = args[0] as MovableSession;
	if (
		!expected ||
		typeof expected.terminalId !== "string" ||
		!["claude", "codex"].includes(expected.agent)
	)
		throw new Error("invalid-session-command");
	const row = host
		.listSessions(expected.agent)
		.find((candidate) => candidate.terminalId === expected.terminalId);
	const resume = async () => {
		pendingResumes.set(expected.terminalId, expected);
		if (pendingResumes.size > 1000)
			pendingResumes.delete(pendingResumes.keys().next().value as string);
		const result = await host.killAndResume({
			workspaceId: expected.workspaceId,
			terminalId: expected.terminalId,
			...(typeof args[1] === "string" ? { prompt: args[1] } : {}),
			...(args[2] === "limit-stop" ? { mode: "limit-stop" as const } : {}),
		});
		if (result) pendingResumes.delete(expected.terminalId);
		return result;
	};
	if (!row || !host.isTerminalAlive(expected.terminalId)) {
		const retained = pendingResumes.get(expected.terminalId);
		// Only an already accepted kill may retry its failed resume. A fresh
		// request cannot fabricate a departed session to bypass live checks.
		return method === "killAndResume" &&
			retained?.workspaceId === expected.workspaceId &&
			retained.lastEventAt === expected.lastEventAt &&
			!host.isTerminalAlive(expected.terminalId)
			? resume()
			: null;
	}
	if (
		!row.managed ||
		row.workspaceId !== expected.workspaceId ||
		row.lastEventType !== expected.lastEventType ||
		row.lastEventAt !== expected.lastEventAt
	)
		return null;
	if (method === "snapshot") return host.snapshotTerminal(row.terminalId);
	if (method === "killAndResume") {
		if (args[2] === "limit-stop") {
			const screen = await host.snapshotTerminal(row.terminalId);
			if (screen === null || !observeProviderLimit(row.agent, screen))
				return null;
			// Screen reads await the org terminal service. Recheck the binding
			// after that await so a newly started turn cannot be killed.
			const current = host
				.listSessions(row.agent)
				.find((candidate) => candidate.terminalId === row.terminalId);
			if (
				!current?.managed ||
				current.lastEventAt !== expected.lastEventAt ||
				current.lastEventType !== expected.lastEventType ||
				!host.isTerminalAlive(row.terminalId)
			)
				return null;
			return resume();
		}
		const event = host.lastAgentEvent?.(row.terminalId);
		const staleCodex =
			row.agent === "codex" &&
			(event?.type ?? row.lastEventType) === "Start" &&
			Date.now() - (event?.at ?? row.lastEventAt) >= STALE_START_MS;
		if (host.isAgentBusy(row.terminalId) && !staleCodex) return null;
		return resume();
	}
	if (method === "send") {
		if (
			!host.hasStartedAgent(row.terminalId, row.agent) ||
			!host.isBracketedPasteActive(row.terminalId) ||
			typeof args[1] !== "string"
		)
			throw new Error("session-not-ready");
		await host.sendToTerminal({
			workspaceId: row.workspaceId,
			terminalId: row.terminalId,
			text: args[1],
		});
		return true;
	}
	throw new Error("unknown-session-command");
}

const scoped = (organizationId: string, id: string) =>
	JSON.stringify([organizationId, id]);

export class MachineSessions {
	private readonly clients = new Map<
		string,
		{
			rpc: AccountRpc;
			rows: SessionSnapshot[];
			retained: Map<string, SessionSnapshot>;
			updatedAt: number;
		}
	>();
	onChange: () => void = () => {};
	register(organizationId: string, rpc: AccountRpc): void {
		this.clients.set(organizationId, {
			rpc,
			rows: [],
			retained: new Map(),
			updatedAt: Date.now(),
		});
	}
	async replace(organizationId: string): Promise<void> {
		const previous = this.clients.get(organizationId);
		if (!previous) return;
		try {
			await previous.rpc.request("replaced");
		} finally {
			previous.rpc.socket.destroy();
		}
	}
	update(
		organizationId: string,
		rpc: AccountRpc,
		rows: SessionSnapshot[],
	): void {
		const client = this.clients.get(organizationId);
		if (client?.rpc !== rpc) throw new Error("account-client-replaced");
		client.rows = rows;
		client.updatedAt = Date.now();
		this.onChange();
	}
	unregister(organizationId: string, rpc: AccountRpc): void {
		if (this.clients.get(organizationId)?.rpc === rpc)
			this.clients.delete(organizationId);
	}
	private lookup(terminalId: string) {
		for (const [organizationId, client] of this.clients) {
			if (Date.now() - client.updatedAt > 15_000) continue;
			const snapshot =
				client.rows.find(
					(value) =>
						scoped(organizationId, value.row.terminalId) === terminalId,
				) ?? client.retained.get(terminalId);
			if (snapshot) return { ...snapshot, client, organizationId };
		}
		return undefined;
	}
	broadcast(method: string, payload: unknown): void {
		for (const client of this.clients.values())
			void client.rpc.request(method, [payload]).catch(() => {});
	}
	attention(payload: {
		needsAttention?: {
			workspaceId: string;
			terminalId: string;
			reason: string;
		};
	}): void {
		const attention = payload.needsAttention;
		const found = attention && this.lookup(attention.terminalId);
		if (found)
			void found.client.rpc
				.request("engineState", [
					{
						...payload,
						needsAttention: {
							...attention,
							workspaceId: found.row.workspaceId,
							terminalId: found.row.terminalId,
						},
					},
				])
				.catch(() => {});
	}
	readonly hostDeps: AccountEngineHostDeps = {
		listSessions: (agent: AccountAgent) =>
			[...this.clients].flatMap(([organizationId, client]) =>
				Date.now() - client.updatedAt > 15_000
					? []
					: client.rows
							.filter((value) => value.row.agent === agent)
							.map(({ row }) => ({
								...row,
								terminalId: scoped(organizationId, row.terminalId),
								workspaceId: scoped(organizationId, row.workspaceId),
							})),
			),
		isAgentBusy: (id) => this.lookup(id)?.busy ?? true,
		lastAgentEvent: (id) => {
			const row = this.lookup(id)?.row;
			return row && { type: row.lastEventType, at: row.lastEventAt };
		},
		isTerminalAlive: (id) => this.lookup(id)?.alive ?? false,
		hasStartedAgent: (id, agent) => {
			const row = this.lookup(id);
			return row?.row.agent === agent && row.started;
		},
		isBracketedPasteActive: (id) => this.lookup(id)?.bracketed ?? false,
		snapshotTerminal: async (id) => {
			const found = this.lookup(id);
			return found ? found.client.rpc.request("snapshot", [found.row]) : null;
		},
		killAndResume: async ({ terminalId, prompt, mode, expectedEventAt }) => {
			const found = this.lookup(terminalId);
			if (!found) return null;
			if (
				expectedEventAt !== undefined &&
				found.row.lastEventAt !== expectedEventAt
			)
				return null;
			found.client.retained.set(terminalId, {
				row: found.row,
				busy: false,
				alive: false,
				started: false,
				bracketed: false,
			});
			if (found.client.retained.size > 1000)
				found.client.retained.delete(
					found.client.retained.keys().next().value as string,
				);
			const resumed = await found.client.rpc.request<{
				terminalId: string;
			} | null>("killAndResume", [found.row, prompt, mode]);
			if (resumed) found.client.retained.delete(terminalId);
			return (
				resumed && {
					terminalId: scoped(found.organizationId, resumed.terminalId),
				}
			);
		},
		sendToTerminal: async ({ terminalId, text }) => {
			const found = this.lookup(terminalId);
			if (
				!found ||
				(await found.client.rpc.request("send", [found.row, text])) !== true
			)
				throw new Error("session-not-ready");
		},
	};
}
