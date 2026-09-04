import type { AgentDefinitionId } from "@superset/shared/agent-catalog";
import { and, desc, eq, inArray, isNotNull, isNull, ne, or } from "drizzle-orm";
import type { HostDb } from "../db";
import { terminalAgentBindings, terminalSessions } from "../db/schema.ts";
import type {
	TerminalAgentBindingListFilter,
	TerminalAgentBindingPersistence,
} from "./store";
import type {
	TerminalAgentBinding,
	TerminalAgentEndReason,
	TerminalAgentId,
} from "./types";

const bindingColumns = {
	terminalId: terminalAgentBindings.terminalId,
	workspaceId: terminalAgentBindings.workspaceId,
	agentId: terminalAgentBindings.agentId,
	agentSessionId: terminalAgentBindings.agentSessionId,
	definitionId: terminalAgentBindings.definitionId,
	startedAt: terminalAgentBindings.startedAt,
	lastEventAt: terminalAgentBindings.lastEventAt,
	lastEventType: terminalAgentBindings.lastEventType,
	endedAt: terminalAgentBindings.endedAt,
	endReason: terminalAgentBindings.endReason,
};

interface BindingRow {
	terminalId: string;
	workspaceId: string;
	agentId: TerminalAgentId;
	agentSessionId: string | null;
	definitionId: AgentDefinitionId | null;
	startedAt: number;
	lastEventAt: number;
	lastEventType: string;
	endedAt: number | null;
	endReason: string | null;
}

function rowToBinding(row: BindingRow): TerminalAgentBinding {
	return {
		terminalId: row.terminalId,
		workspaceId: row.workspaceId,
		agentId: row.agentId,
		...(row.agentSessionId ? { agentSessionId: row.agentSessionId } : {}),
		...(row.definitionId ? { definitionId: row.definitionId } : {}),
		startedAt: row.startedAt,
		lastEventAt: row.lastEventAt,
		lastEventType: row.lastEventType,
		...(row.endedAt !== null ? { endedAt: row.endedAt } : {}),
		...(row.endReason !== null
			? { endReason: row.endReason as TerminalAgentEndReason }
			: {}),
	};
}

/**
 * Some agents run their SessionEnd hooks on SIGHUP — a daemon kill or pty
 * death makes claude "say goodbye" moments before dying. A detach this close
 * to the terminal's death is that death gasp, not a user quit, so it
 * upgrades to a resume candidate. A detach older than this is a real quit
 * (the shell outlived the agent) and stays final.
 */
const DEATH_GASP_DETACH_WINDOW_MS = 30_000;

/**
 * Mark a binding's agent session as ended without deleting the row, so its
 * `agentSessionId` survives for resume. "terminal-exited" is sticky: a
 * goodbye that trickles in after the terminal already died never downgrades
 * a resume candidate. Standalone so terminal internals (pty exit, daemon
 * disconnect, cold respawn) can mark ended with just a db handle. Returns
 * the workspaceId when a row was updated.
 */
export function markTerminalAgentBindingEnded(
	db: HostDb,
	terminalId: string,
	reason: TerminalAgentEndReason,
	endedAt: number = Date.now(),
): { workspaceId: string } | undefined {
	const row = db
		.select({
			workspaceId: terminalAgentBindings.workspaceId,
			endedAt: terminalAgentBindings.endedAt,
			endReason: terminalAgentBindings.endReason,
		})
		.from(terminalAgentBindings)
		.where(eq(terminalAgentBindings.terminalId, terminalId))
		.get();
	if (!row) return undefined;

	if (row.endedAt !== null) {
		const isDeathGaspDetach =
			reason === "terminal-exited" &&
			row.endReason === "detached" &&
			endedAt - row.endedAt <= DEATH_GASP_DETACH_WINDOW_MS;
		if (!isDeathGaspDetach) return undefined;
		db.update(terminalAgentBindings)
			.set({ endReason: "terminal-exited" })
			.where(eq(terminalAgentBindings.terminalId, terminalId))
			.run();
		return { workspaceId: row.workspaceId };
	}

	db.update(terminalAgentBindings)
		.set({ endedAt, endReason: reason })
		.where(eq(terminalAgentBindings.terminalId, terminalId))
		.run();
	return { workspaceId: row.workspaceId };
}

/** The agent session id a terminal's binding currently points at, if any. */
export function getTerminalAgentBindingSessionId(
	db: HostDb,
	terminalId: string,
): string | undefined {
	const row = db
		.select({ agentSessionId: terminalAgentBindings.agentSessionId })
		.from(terminalAgentBindings)
		.where(eq(terminalAgentBindings.terminalId, terminalId))
		.get();
	return row?.agentSessionId ?? undefined;
}

/**
 * A dead terminal's binding is resumable when: agent session id captured and
 * the terminal died under the agent ("terminal-exited") rather than the agent
 * detaching cleanly. A session still at "Attached" (started, never prompted)
 * qualifies too: the relaunch checks the harness's store and starts the agent
 * fresh when there is no conversation to resume — see
 * resumeTerminalAgentSession.
 */
function resumeCandidatePredicate(workspaceId: string, terminalId: string) {
	return and(
		eq(terminalAgentBindings.terminalId, terminalId),
		eq(terminalAgentBindings.workspaceId, workspaceId),
		isNotNull(terminalAgentBindings.endedAt),
		eq(terminalAgentBindings.endReason, "terminal-exited"),
		isNotNull(terminalAgentBindings.agentSessionId),
	);
}

/** The ended binding a dead terminal can be resumed from, if any. */
export function findResumeCandidateBinding(
	db: HostDb,
	workspaceId: string,
	terminalId: string,
): TerminalAgentBinding | undefined {
	const row = db
		.select(bindingColumns)
		.from(terminalAgentBindings)
		.where(resumeCandidatePredicate(workspaceId, terminalId))
		.get();
	return row ? rowToBinding(row) : undefined;
}

/**
 * Atomically consume a resume candidate by flipping its end reason to
 * "resumed". The UPDATE is guarded by the full candidate predicate, so of any
 * number of concurrent claimers exactly one gets the binding back — the rest
 * (and any retry after success) get undefined. `unclaimResumeCandidateBinding`
 * is the rollback for a claim whose relaunch failed.
 */
export function claimResumeCandidateBinding(
	db: HostDb,
	workspaceId: string,
	terminalId: string,
): TerminalAgentBinding | undefined {
	const row = db
		.update(terminalAgentBindings)
		.set({ endReason: "resumed" })
		.where(resumeCandidatePredicate(workspaceId, terminalId))
		.returning(bindingColumns)
		.get();
	return row ? rowToBinding(row) : undefined;
}

/** Roll a failed claim back so the session stays resumable. */
export function unclaimResumeCandidateBinding(
	db: HostDb,
	terminalId: string,
): void {
	db.update(terminalAgentBindings)
		.set({ endReason: "terminal-exited" })
		.where(
			and(
				eq(terminalAgentBindings.terminalId, terminalId),
				eq(terminalAgentBindings.endReason, "resumed"),
			),
		)
		.run();
}

export type SeedEndedBindingResult =
	| "seeded"
	| "already-bound"
	| "terminal-not-found";

/**
 * Seed an already-ended binding for a terminal that never hosted the agent —
 * used by the v1→v2 pane migration to carry a v1 pane's agent session into
 * the pane's recreated terminal as a resume candidate. `lastEventType` is
 * "Stop" (not "Attached") because the v1 capture only surfaces sessions that
 * progressed past their first prompt. Never overwrites: a terminal that
 * already earned a real binding keeps it ("already-bound").
 */
export function seedEndedTerminalAgentBinding(
	db: HostDb,
	input: {
		terminalId: string;
		workspaceId: string;
		agentId: TerminalAgentId;
		agentSessionId: string;
		definitionId?: AgentDefinitionId;
		seededAt?: number;
	},
): SeedEndedBindingResult {
	const session = db
		.select({ originWorkspaceId: terminalSessions.originWorkspaceId })
		.from(terminalSessions)
		.where(eq(terminalSessions.id, input.terminalId))
		.get();
	if (!session || session.originWorkspaceId !== input.workspaceId) {
		return "terminal-not-found";
	}

	const bound = db
		.select({ terminalId: terminalAgentBindings.terminalId })
		.from(terminalAgentBindings)
		.where(eq(terminalAgentBindings.terminalId, input.terminalId))
		.get();
	if (bound) return "already-bound";

	const seededAt = input.seededAt ?? Date.now();
	db.insert(terminalAgentBindings)
		.values({
			terminalId: input.terminalId,
			workspaceId: input.workspaceId,
			agentId: input.agentId,
			agentSessionId: input.agentSessionId,
			definitionId: input.definitionId ?? null,
			startedAt: seededAt,
			lastEventAt: seededAt,
			lastEventType: "Stop",
			endedAt: seededAt,
			endReason: "terminal-exited",
		})
		.onConflictDoNothing({ target: terminalAgentBindings.terminalId })
		.run();
	return "seeded";
}

export class SqliteTerminalAgentBindingPersistence
	implements TerminalAgentBindingPersistence
{
	// No parameter property: this module is on terminal.ts's import chain,
	// which node --experimental-strip-types test runners load unbundled.
	private readonly db: HostDb;

	constructor(db: HostDb) {
		this.db = db;
	}

	load(): TerminalAgentBinding[] {
		const rows = this.db
			.select(bindingColumns)
			.from(terminalAgentBindings)
			.innerJoin(
				terminalSessions,
				eq(terminalAgentBindings.terminalId, terminalSessions.id),
			)
			.where(
				and(
					ne(terminalSessions.status, "disposed"),
					isNull(terminalAgentBindings.endedAt),
				),
			)
			.all();

		return rows.map(rowToBinding);
	}

	/**
	 * Bindings whose terminal session is still `active` and workspace-owned.
	 * Liveness comes from `terminal_sessions.status` — the source already
	 * maintained by pty onExit, the dispose routes, and the reaper's orphan
	 * healing — so a dead terminal's agent is unrepresentable in reads no
	 * matter how the terminal died (kill -9, crash, host downtime).
	 */
	listLiveByWorkspace(
		workspaceId: string,
		filter?: TerminalAgentBindingListFilter,
	): TerminalAgentBinding[] {
		const rows = this.db
			.select(bindingColumns)
			.from(terminalAgentBindings)
			.innerJoin(
				terminalSessions,
				eq(terminalAgentBindings.terminalId, terminalSessions.id),
			)
			.where(
				and(
					eq(terminalAgentBindings.workspaceId, workspaceId),
					eq(terminalSessions.status, "active"),
					isNotNull(terminalSessions.originWorkspaceId),
					isNull(terminalAgentBindings.endedAt),
					...(filter?.agentId
						? [eq(terminalAgentBindings.agentId, filter.agentId)]
						: []),
					...(filter?.definitionId
						? [eq(terminalAgentBindings.definitionId, filter.definitionId)]
						: []),
				),
			)
			.all();

		return rows.map(rowToBinding);
	}

	listLive(): TerminalAgentBinding[] {
		const rows = this.db
			.select(bindingColumns)
			.from(terminalAgentBindings)
			.innerJoin(
				terminalSessions,
				eq(terminalAgentBindings.terminalId, terminalSessions.id),
			)
			.where(
				and(
					eq(terminalSessions.status, "active"),
					isNotNull(terminalSessions.originWorkspaceId),
					isNull(terminalAgentBindings.endedAt),
				),
			)
			.all();

		return rows.map(rowToBinding);
	}

	findLiveActive(
		workspaceId: string,
		agentId: TerminalAgentId,
		definitionId?: AgentDefinitionId,
	): TerminalAgentBinding | undefined {
		const rows = this.db
			.select(bindingColumns)
			.from(terminalAgentBindings)
			.innerJoin(
				terminalSessions,
				eq(terminalAgentBindings.terminalId, terminalSessions.id),
			)
			.where(
				and(
					eq(terminalAgentBindings.workspaceId, workspaceId),
					eq(terminalAgentBindings.agentId, agentId),
					eq(terminalSessions.status, "active"),
					isNotNull(terminalSessions.originWorkspaceId),
					isNull(terminalAgentBindings.endedAt),
					...(definitionId
						? [eq(terminalAgentBindings.definitionId, definitionId)]
						: []),
				),
			)
			.orderBy(desc(terminalAgentBindings.lastEventAt))
			.limit(1)
			.all();

		const row = rows[0];
		return row ? rowToBinding(row) : undefined;
	}

	/**
	 * Best-effort boot hygiene. Bindings whose session row is missing or
	 * workspace-less have nothing left to resume into — drop them. Bindings
	 * whose terminal is `exited`/`disposed` but never got marked ended (the
	 * host was down when the terminal died) are backfilled as
	 * "terminal-exited" so they survive as resume candidates. Reads already
	 * hide non-live bindings via the live join, so callers may swallow
	 * failures.
	 */
	sweepDefunct(): void {
		const doomed = this.db
			.select({ terminalId: terminalAgentBindings.terminalId })
			.from(terminalAgentBindings)
			.leftJoin(
				terminalSessions,
				eq(terminalAgentBindings.terminalId, terminalSessions.id),
			)
			.where(
				or(
					isNull(terminalSessions.id),
					isNull(terminalSessions.originWorkspaceId),
				),
			)
			.all();
		if (doomed.length > 0) {
			this.db
				.delete(terminalAgentBindings)
				.where(
					inArray(
						terminalAgentBindings.terminalId,
						doomed.map((row) => row.terminalId),
					),
				)
				.run();
		}

		const unmarked = this.db
			.select({ terminalId: terminalAgentBindings.terminalId })
			.from(terminalAgentBindings)
			.innerJoin(
				terminalSessions,
				eq(terminalAgentBindings.terminalId, terminalSessions.id),
			)
			.where(
				and(
					inArray(terminalSessions.status, ["exited", "disposed"]),
					isNull(terminalAgentBindings.endedAt),
				),
			)
			.all();
		if (unmarked.length > 0) {
			this.db
				.update(terminalAgentBindings)
				.set({ endedAt: Date.now(), endReason: "terminal-exited" })
				.where(
					inArray(
						terminalAgentBindings.terminalId,
						unmarked.map((row) => row.terminalId),
					),
				)
				.run();
		}
	}

	markEnded(
		terminalId: string,
		reason: TerminalAgentEndReason,
		endedAt?: number,
	): { workspaceId: string } | undefined {
		return markTerminalAgentBindingEnded(this.db, terminalId, reason, endedAt);
	}

	getEnded(
		terminalId: string,
	): { endedAt: number; agentSessionId?: string } | undefined {
		const row = this.db
			.select({
				endedAt: terminalAgentBindings.endedAt,
				agentSessionId: terminalAgentBindings.agentSessionId,
			})
			.from(terminalAgentBindings)
			.where(eq(terminalAgentBindings.terminalId, terminalId))
			.get();
		if (!row || row.endedAt === null) return undefined;
		return {
			endedAt: row.endedAt,
			...(row.agentSessionId ? { agentSessionId: row.agentSessionId } : {}),
		};
	}

	upsert(binding: TerminalAgentBinding): void {
		// A fresh event for the terminal revives an ended row: a new agent
		// session started there, so the old resume candidate is superseded.
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
				endedAt: null,
				endReason: null,
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
					endedAt: null,
					endReason: null,
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
