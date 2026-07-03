import { eq, inArray, isNull, ne, or } from "drizzle-orm";
import type { HostDb } from "../db";
import { terminalAgentBindings, terminalSessions } from "../db/schema";
import type {
	TerminalAgentBindingPersistence,
	TerminalAgentStore,
} from "./store";
import type { TerminalAgentBinding } from "./types";

/**
 * Terminal ids whose bindings are defunct: the session row is missing,
 * `exited`/`disposed`, or workspace-less (the same orphan criteria the
 * terminal reaper uses). The single source of the staleness criteria — the
 * startup drain deletes matching bindings and the `listByWorkspace` read
 * filter excludes them, so the two layers can't drift apart.
 */
export function listDefunctBindingTerminalIds(db: HostDb): Set<string> {
	const rows = db
		.select({ terminalId: terminalAgentBindings.terminalId })
		.from(terminalAgentBindings)
		.leftJoin(
			terminalSessions,
			eq(terminalAgentBindings.terminalId, terminalSessions.id),
		)
		.where(
			or(
				isNull(terminalSessions.id),
				inArray(terminalSessions.status, ["exited", "disposed"]),
				isNull(terminalSessions.originWorkspaceId),
			),
		)
		.all();
	return new Set(rows.map((row) => row.terminalId));
}

/**
 * Prune bindings whose terminal can no longer be hosting an agent. Exit-event
 * pruning only covers terminals that die while the host-service is up, so run
 * this once at startup, after hydrating the store, to drain bindings
 * persisted for terminals that died in between.
 */
export function reconcileTerminalAgentBindings({
	db,
	store,
}: {
	db: HostDb;
	store: TerminalAgentStore;
}): void {
	for (const terminalId of listDefunctBindingTerminalIds(db)) {
		store.markTerminalExited(terminalId);
	}
}

export class SqliteTerminalAgentBindingPersistence
	implements TerminalAgentBindingPersistence
{
	constructor(private readonly db: HostDb) {}

	load(): TerminalAgentBinding[] {
		const rows = this.db
			.select({
				terminalId: terminalAgentBindings.terminalId,
				workspaceId: terminalAgentBindings.workspaceId,
				agentId: terminalAgentBindings.agentId,
				agentSessionId: terminalAgentBindings.agentSessionId,
				definitionId: terminalAgentBindings.definitionId,
				startedAt: terminalAgentBindings.startedAt,
				lastEventAt: terminalAgentBindings.lastEventAt,
				lastEventType: terminalAgentBindings.lastEventType,
			})
			.from(terminalAgentBindings)
			.innerJoin(
				terminalSessions,
				eq(terminalAgentBindings.terminalId, terminalSessions.id),
			)
			.where(ne(terminalSessions.status, "disposed"))
			.all();

		return rows.map((row) => ({
			terminalId: row.terminalId,
			workspaceId: row.workspaceId,
			agentId: row.agentId,
			...(row.agentSessionId ? { agentSessionId: row.agentSessionId } : {}),
			...(row.definitionId ? { definitionId: row.definitionId } : {}),
			startedAt: row.startedAt,
			lastEventAt: row.lastEventAt,
			lastEventType: row.lastEventType,
		}));
	}

	upsert(binding: TerminalAgentBinding): void {
		this.db
			.insert(terminalAgentBindings)
			.values({
				terminalId: binding.terminalId,
				workspaceId: binding.workspaceId,
				agentId: binding.agentId,
				agentSessionId: binding.agentSessionId ?? null,
				definitionId: binding.definitionId ?? null,
				startedAt: binding.startedAt,
				lastEventAt: binding.lastEventAt,
				lastEventType: binding.lastEventType,
			})
			.onConflictDoUpdate({
				target: terminalAgentBindings.terminalId,
				set: {
					workspaceId: binding.workspaceId,
					agentId: binding.agentId,
					agentSessionId: binding.agentSessionId ?? null,
					definitionId: binding.definitionId ?? null,
					startedAt: binding.startedAt,
					lastEventAt: binding.lastEventAt,
					lastEventType: binding.lastEventType,
				},
			})
			.run();
	}

	delete(terminalId: string): void {
		this.db
			.delete(terminalAgentBindings)
			.where(eq(terminalAgentBindings.terminalId, terminalId))
			.run();
	}
}
