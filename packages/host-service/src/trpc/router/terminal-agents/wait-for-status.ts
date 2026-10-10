import { agentStatusFromEvent } from "@superset/shared/agent-status";
import type { TerminalAgentWaitStatus } from "@superset/shared/terminal-agent-wait";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import type { HostDb } from "../../../db";
import { terminalSessions } from "../../../db/schema";
import type { EventBus } from "../../../events";
import type {
	TerminalAgentBinding,
	TerminalAgentStore,
} from "../../../terminal-agents";
import { getTerminalAgentBinding } from "../../../terminal-agents/persistence";

export interface TerminalAgentStatusDeps {
	db: HostDb;
	terminalAgentStore: TerminalAgentStore;
	eventBus?: Pick<EventBus, "onTerminalLifecycle">;
	/**
	 * The reaper and the boot sweep stamp a binding ended straight in SQLite,
	 * with no store or bus event. This poll is how a wait for "ended" still
	 * returns in that case.
	 */
	endWritePollMs?: number;
}

export interface TerminalAgentStatusSnapshot {
	binding: {
		terminalId: string;
		workspaceId: string;
		agentId: TerminalAgentBinding["agentId"];
		agentSessionId: string | null;
		definitionId: NonNullable<TerminalAgentBinding["definitionId"]> | null;
		startedAt: number;
		lastEventAt: number;
		lastEventType: string;
		endedAt: number | null;
		endReason: NonNullable<TerminalAgentBinding["endReason"]> | null;
	};
	status: TerminalAgentWaitStatus;
	/** Host-clock time of the event `status` derives from. */
	observedAt: number;
	sinceMs: number;
}

export interface WaitForTerminalAgentStatusInput {
	workspaceId: string;
	terminalId: string;
	until: readonly TerminalAgentWaitStatus[];
	timeoutMs: number;
	/**
	 * Only an event newer than this host-clock timestamp counts. Without it a
	 * status that already matches resolves at once.
	 */
	after?: number;
	signal?: AbortSignal;
}

const DEFAULT_END_WRITE_POLL_MS = 1_000;

/**
 * The desktop's deriveTerminalAgentStatus without seen-gating: a finished
 * turn is "idle" here where a pane may still show "review". A persisted
 * ended row never reaches the desktop derivation at all, and the event it
 * has no status for (Attached) is kept apart from idle so a wait issued
 * right after a launch does not return before the prompt is picked up.
 */
export function terminalAgentWaitStatus(
	binding: TerminalAgentBinding,
): TerminalAgentWaitStatus {
	if (binding.endedAt !== undefined) return "ended";
	const status = agentStatusFromEvent(binding.lastEventType);
	if (status === null) return "attached";
	return status === "review" ? "idle" : status;
}

function terminalExists(
	db: HostDb,
	workspaceId: string,
	terminalId: string,
): boolean {
	return (
		db
			.select({ id: terminalSessions.id })
			.from(terminalSessions)
			.where(
				and(
					eq(terminalSessions.id, terminalId),
					eq(terminalSessions.originWorkspaceId, workspaceId),
				),
			)
			.get() !== undefined
	);
}

function readBinding(
	deps: TerminalAgentStatusDeps,
	workspaceId: string,
	terminalId: string,
): TerminalAgentBinding | undefined {
	// The row first: PTY exit stamps it ended without touching the store's
	// in-memory entry. The store only answers for a binding not persisted yet.
	const binding =
		getTerminalAgentBinding(deps.db, terminalId) ??
		deps.terminalAgentStore.get(terminalId);
	return binding?.workspaceId === workspaceId ? binding : undefined;
}

export function snapshotTerminalAgent(
	deps: TerminalAgentStatusDeps,
	input: { workspaceId: string; terminalId: string },
	now: number = Date.now(),
): TerminalAgentStatusSnapshot | null {
	const binding = readBinding(deps, input.workspaceId, input.terminalId);
	if (!binding) return null;
	const observedAt = Math.max(binding.lastEventAt, binding.endedAt ?? 0);
	return {
		binding: {
			terminalId: binding.terminalId,
			workspaceId: binding.workspaceId,
			agentId: binding.agentId,
			agentSessionId: binding.agentSessionId ?? null,
			definitionId: binding.definitionId ?? null,
			startedAt: binding.startedAt,
			lastEventAt: binding.lastEventAt,
			lastEventType: binding.lastEventType,
			endedAt: binding.endedAt ?? null,
			endReason: binding.endReason ?? null,
		},
		status: terminalAgentWaitStatus(binding),
		observedAt,
		sinceMs: Math.max(0, now - observedAt),
	};
}

/**
 * Block until the terminal's agent status is one of `until`. A terminal
 * whose agent has not reported yet (just launched) is waited on, so
 * "launch, then wait" works; NOT_FOUND is for a terminal that is not in the
 * workspace at all. TIMEOUT once the deadline passes, CLIENT_CLOSED_REQUEST
 * when the caller goes away first.
 */
export function waitForTerminalAgentStatus(
	deps: TerminalAgentStatusDeps,
	input: WaitForTerminalAgentStatusInput,
): Promise<TerminalAgentStatusSnapshot> {
	const { workspaceId, terminalId, until, timeoutMs, after, signal } = input;
	const snapshot = () =>
		snapshotTerminalAgent(deps, { workspaceId, terminalId });
	const accepted = (current: TerminalAgentStatusSnapshot) =>
		until.includes(current.status) &&
		(after === undefined || current.observedAt > after);

	let lastSeen = snapshot();
	if (lastSeen && accepted(lastSeen)) return Promise.resolve(lastSeen);
	if (!lastSeen && !terminalExists(deps.db, workspaceId, terminalId)) {
		return Promise.reject(
			new TRPCError({
				code: "NOT_FOUND",
				message: `No terminal ${terminalId} in workspace ${workspaceId}`,
			}),
		);
	}
	if (signal?.aborted) return Promise.reject(abortedError());

	const store = deps.terminalAgentStore;
	return new Promise((resolve, reject) => {
		const check = () => {
			const current = snapshot();
			if (!current) {
				// A binding that was here and is gone, or a terminal row that
				// vanished, means the terminal was deleted under the wait.
				if (lastSeen || !terminalExists(deps.db, workspaceId, terminalId)) {
					cleanup();
					reject(
						new TRPCError({
							code: "NOT_FOUND",
							message: `Terminal ${terminalId} is gone from workspace ${workspaceId}`,
						}),
					);
				}
				return;
			}
			lastSeen = current;
			if (!accepted(current)) return;
			cleanup();
			resolve(current);
		};
		const onStoreChange = (changedWorkspaceId: string) => {
			if (changedWorkspaceId === workspaceId) check();
		};
		const onAbort = () => {
			cleanup();
			reject(abortedError());
		};
		const unsubscribeLifecycle = deps.eventBus?.onTerminalLifecycle((event) => {
			if (event.workspaceId === workspaceId && event.terminalId === terminalId)
				check();
		});
		const poll = setInterval(
			check,
			deps.endWritePollMs ?? DEFAULT_END_WRITE_POLL_MS,
		);
		const timer = setTimeout(() => {
			cleanup();
			const seen = lastSeen
				? `last status: ${lastSeen.status}`
				: "no agent has reported from it";
			reject(
				new TRPCError({
					code: "TIMEOUT",
					message: `Timed out after ${timeoutMs}ms waiting for terminal ${terminalId} to reach one of: ${until.join(", ")} (${seen})`,
				}),
			);
		}, timeoutMs);
		const cleanup = () => {
			clearTimeout(timer);
			clearInterval(poll);
			store.off("change", onStoreChange);
			unsubscribeLifecycle?.();
			signal?.removeEventListener("abort", onAbort);
		};

		store.on("change", onStoreChange);
		signal?.addEventListener("abort", onAbort, { once: true });
	});
}

function abortedError(): TRPCError {
	return new TRPCError({
		code: "CLIENT_CLOSED_REQUEST",
		message: "The caller stopped waiting",
	});
}
