import { EventEmitter } from "node:events";
import type { AgentDefinitionId } from "@superset/shared/agent-catalog";
import {
	getSubagentHarness,
	isTrustedTranscriptPath,
	readSubagentTranscript,
	type SubagentHarness,
	type SubagentParentResolution,
	type SubagentTranscriptHint,
} from "./subagent-harnesses";
import { deriveSubagentStatus } from "./subagent-status";
import type { SubagentTranscript } from "./subagent-transcript";
import type {
	TerminalAgentBinding,
	TerminalAgentEndReason,
	TerminalAgentId,
	TerminalSubagent,
} from "./types";

interface RecordEventInput {
	terminalId: string;
	workspaceId: string;
	eventType: string;
	agentId?: TerminalAgentId;
	agentSessionId?: string;
	definitionId?: AgentDefinitionId;
	occurredAt: number;
}

interface RecordSubagentEventInput {
	terminalId: string;
	workspaceId: string;
	/** Raw hook event name (`SubagentStart`, `PostToolUse`, `SubagentStop`, …). */
	eventType: string;
	subagentId: string;
	agentType?: string;
	sessionId?: string;
	transcriptPath?: string;
	toolName?: string;
	toolSummary?: string;
	/** Applied only while the entry has no parent placement yet. */
	parent?: SubagentParentResolution;
	occurredAt: number;
}

interface RecordSubagentHookInput {
	terminalId: string;
	workspaceId: string;
	/** Raw hook event name from the child. */
	eventType: string;
	subagentId: string;
	agentType?: string;
	toolName?: string;
	toolSummary?: string;
	hint: SubagentTranscriptHint;
	occurredAt: number;
}

export interface TerminalAgentBindingListFilter {
	agentId?: TerminalAgentId;
	definitionId?: AgentDefinitionId;
}

// "Detached" is the agent's own goodbye (SessionEnd hooks, the codex wrapper
// exit report) — not resumable. "exit"/"error" are terminal-side deaths.
const END_EVENT_REASONS = new Map<string, TerminalAgentEndReason>([
	["Detached", "detached"],
	["exit", "terminal-exited"],
	["error", "terminal-exited"],
]);

/**
 * Hook events can straggle in after the terminal died (async notify
 * callbacks, in-flight curls). Within this window of the recorded end, only
 * clear evidence of a NEW session may revive an ended row — a straggler
 * upsert would erase `endedAt`/`endReason` and destroy the resume candidate.
 */
const END_STRAGGLER_WINDOW_MS = 30_000;

/**
 * A subagent whose SubagentStop never arrived (parent interrupted, hook
 * dropped) must not stay live forever. Live children re-assert on every
 * tool call, so anything quiet this long is marked stopped.
 */
const SUBAGENT_STALE_MS = 10 * 60_000;

const MAX_ACTIVITY_SUMMARY_CHARS = 160;

/**
 * Finished children stay addressable (their transcript pane may still be
 * open) for this long after their stop, then drop out of memory.
 */
const SUBAGENT_ENDED_RETENTION_MS = 60 * 60_000;

/**
 * The hook endpoint is unauthenticated, so bound what one terminal's roster
 * can hold; the oldest entry makes room for a new child.
 */
const MAX_SUBAGENTS_PER_TERMINAL = 64;

export interface TerminalAgentBindingPersistence {
	load(): TerminalAgentBinding[];
	upsert(binding: TerminalAgentBinding): void;
	delete(terminalId: string): void;
	/**
	 * Retain the row but stamp `endedAt`/`endReason` so the agent session id
	 * survives as a resume candidate. Absent → the store falls back to
	 * deleting (pre-resume behavior).
	 */
	markEnded?(
		terminalId: string,
		reason: TerminalAgentEndReason,
		endedAt?: number,
	): { workspaceId: string } | undefined;
	/** End state of the terminal's row, if it exists and has ended. */
	getEnded?(
		terminalId: string,
	): { endedAt: number; agentSessionId?: string } | undefined;
	/**
	 * Liveness-joined reads (session `active` + workspace-owned). When
	 * provided, the store serves list/find from here so dead-terminal
	 * bindings are unrepresentable; the in-memory map then only backs
	 * `get()` (the fresh-launch wait path).
	 */
	listLiveByWorkspace?(
		workspaceId: string,
		filter?: TerminalAgentBindingListFilter,
	): TerminalAgentBinding[];
	listLive?(): TerminalAgentBinding[];
	findLiveActive?(
		workspaceId: string,
		agentId: TerminalAgentId,
		definitionId?: AgentDefinitionId,
	): TerminalAgentBinding | undefined;
}

/**
 * In-process tracker for which agent is alive in which terminal. Populated
 * by the hook receiver, drained on terminal exit, and optionally restored
 * from host-local persistence across host-service restarts.
 *
 * Emits `"change"` with the affected workspaceId after every mutation.
 */
export class TerminalAgentStore extends EventEmitter {
	private readonly byTerminal = new Map<string, TerminalAgentBinding>();
	private readonly subagentsByTerminal = new Map<
		string,
		Map<string, TerminalSubagent>
	>();
	private readonly persistence: TerminalAgentBindingPersistence | undefined;

	constructor(persistence?: TerminalAgentBindingPersistence) {
		super();
		this.persistence = persistence;

		for (const binding of persistence?.load() ?? []) {
			this.byTerminal.set(binding.terminalId, binding);
		}
	}

	recordEvent(input: RecordEventInput): void {
		const {
			terminalId,
			workspaceId,
			eventType,
			agentId,
			agentSessionId,
			definitionId,
			occurredAt,
		} = input;

		const endReason = END_EVENT_REASONS.get(eventType);
		if (endReason) {
			this.endBinding(terminalId, endReason, occurredAt);
			return;
		}

		const existing = this.byTerminal.get(terminalId);
		if (!agentId && !existing) return;

		// A late event for a dead terminal must not resurrect its ended row
		// (the upsert would clear the resume state). Revive only on a fresh
		// session start, a different agent session id, or an event well past
		// the end (an agent without SessionStart hooks launched later).
		if (!existing && this.persistence?.getEnded) {
			const ended = this.persistence.getEnded(terminalId);
			if (
				ended !== undefined &&
				eventType !== "Attached" &&
				(agentSessionId === undefined ||
					agentSessionId === ended.agentSessionId) &&
				occurredAt - ended.endedAt <= END_STRAGGLER_WINDOW_MS
			) {
				return;
			}
		}

		const nextAgentId = agentId ?? existing?.agentId;
		if (!nextAgentId) return;

		// Only inherit identity metadata when agentId hasn't changed; otherwise
		// a swap event that omits agentSessionId/definitionId would inherit the
		// prior agent's values and corrupt definitionId-filtered reads.
		const prior =
			existing !== undefined && existing.agentId === nextAgentId
				? existing
				: undefined;

		const sessionChanged =
			prior !== undefined &&
			agentSessionId !== undefined &&
			prior.agentSessionId !== agentSessionId;

		// A new agent or session in the terminal orphans the old roster.
		if (prior === undefined || sessionChanged) {
			this.subagentsByTerminal.delete(terminalId);
		}

		// "Attached" is a session-liveness signal, not lifecycle progress. The
		// wrapper's launch report is delayed and can land after the session
		// already advanced past it (working, a Stop that makes the row a
		// resume candidate, a surfaced Failed) — keep the prior state unless
		// the event belongs to a different session.
		const preservedLifecycleState =
			eventType === "Attached" && prior !== undefined && !sessionChanged
				? prior.lastEventType
				: undefined;

		const next: TerminalAgentBinding = {
			terminalId,
			workspaceId,
			agentId: nextAgentId,
			agentSessionId: agentSessionId ?? prior?.agentSessionId,
			definitionId: definitionId ?? prior?.definitionId,
			startedAt:
				prior !== undefined && !sessionChanged ? prior.startedAt : occurredAt,
			lastEventAt: occurredAt,
			lastEventType: preservedLifecycleState ?? eventType,
		};

		this.byTerminal.set(terminalId, next);
		this.persistence?.upsert(next);
		this.emit("change", workspaceId);
	}

	/**
	 * A hook fired inside a subagent of the terminal's agent. Any event keeps
	 * the child live (lost SubagentStarts self-heal on its next tool call);
	 * a stop ends it. Never touches the parent binding's lifecycle state.
	 */
	recordSubagentEvent(input: RecordSubagentEventInput): void {
		const {
			terminalId,
			workspaceId,
			eventType,
			subagentId,
			agentType,
			sessionId,
			transcriptPath,
			toolName,
			toolSummary,
			parent,
			occurredAt,
		} = input;
		const roster = this.subagentsByTerminal.get(terminalId);
		const existing = roster?.get(subagentId);

		const harness = getSubagentHarness(
			this.byTerminal.get(terminalId)?.agentId,
		);
		const status = deriveSubagentStatus(eventType, harness);
		const nextPath = transcriptPath ?? existing?.transcriptPath;
		const description =
			existing?.description ??
			(nextPath ? harness.readDescription(nextPath) : undefined);
		const activity =
			toolName !== undefined
				? {
						toolName,
						summary: clipActivitySummary(toolSummary ?? ""),
						at: occurredAt,
					}
				: existing?.activity;

		if (harness.isStopEvent(eventType)) {
			if (!existing || existing.endedAt !== undefined) return;
			roster?.set(subagentId, {
				...existing,
				...(description ? { description } : {}),
				...(nextPath ? { transcriptPath: nextPath } : {}),
				...(activity ? { activity } : {}),
				status,
				lastEventAt: occurredAt,
				endedAt: occurredAt,
				endReason: "completed",
			});
			this.emit("change", workspaceId);
			return;
		}

		// A child can only run under a live parent; a straggler after the
		// terminal ended must not recreate a roster for it.
		if (!this.byTerminal.has(terminalId)) return;

		const nextType = agentType ?? existing?.agentType;
		const nextSessionId = sessionId ?? existing?.sessionId;
		const next: TerminalSubagent = {
			id: subagentId,
			...(nextType ? { agentType: nextType } : {}),
			...(description ? { description } : {}),
			...(nextSessionId ? { sessionId: nextSessionId } : {}),
			...placementOf(existing, parent),
			status,
			...(activity ? { activity } : {}),
			// A stopped child that speaks again (Codex send_input) is live again.
			startedAt:
				existing && existing.endedAt === undefined
					? existing.startedAt
					: occurredAt,
			lastEventAt: occurredAt,
			...(nextPath ? { transcriptPath: nextPath } : {}),
		};
		if (roster) {
			roster.set(subagentId, next);
			while (roster.size > MAX_SUBAGENTS_PER_TERMINAL) {
				const oldest = roster.keys().next().value;
				if (oldest === undefined) break;
				roster.delete(oldest);
			}
		} else {
			this.subagentsByTerminal.set(terminalId, new Map([[subagentId, next]]));
		}
		this.emit("change", workspaceId);
	}

	/**
	 * A hook event that fired inside a subagent, straight from the hook
	 * endpoint. The parent binding's harness decides whether the event
	 * belongs to the current session, where the child's transcript lives,
	 * and which roster entry spawned it; the path is kept only when it
	 * passes the trust check, since the endpoint is unauthenticated. Returns
	 * false when the event was dropped.
	 */
	recordSubagentHook(input: RecordSubagentHookInput): boolean {
		const parent = this.byTerminal.get(input.terminalId);
		const harness = getSubagentHarness(parent?.agentId);
		if (
			parent?.agentSessionId &&
			!harness.belongsToParentSession(input.hint, parent.agentSessionId)
		) {
			return false;
		}
		const resolvedPath = harness.resolveTranscriptPath(input.hint);
		const transcriptPath =
			resolvedPath && isTrustedTranscriptPath(resolvedPath)
				? resolvedPath
				: undefined;
		const placement = this.resolveSubagentParent(
			input.terminalId,
			input.subagentId,
			harness,
			input.hint,
			transcriptPath,
			parent?.agentSessionId,
		);
		this.recordSubagentEvent({
			terminalId: input.terminalId,
			workspaceId: input.workspaceId,
			eventType: input.eventType,
			subagentId: input.subagentId,
			...(input.agentType ? { agentType: input.agentType } : {}),
			...(input.hint.sessionId ? { sessionId: input.hint.sessionId } : {}),
			...(transcriptPath ? { transcriptPath } : {}),
			...(input.toolName ? { toolName: input.toolName } : {}),
			...(input.toolSummary ? { toolSummary: input.toolSummary } : {}),
			...(placement ? { parent: placement } : {}),
			occurredAt: input.occurredAt,
		});
		return true;
	}

	/**
	 * Ask the harness where a child sits in the tree, until it has been
	 * placed once. The harness gets the roster as siblings so a Codex
	 * grandchild can be matched to the sibling whose thread spawned it.
	 */
	private resolveSubagentParent(
		terminalId: string,
		subagentId: string,
		harness: SubagentHarness,
		hint: SubagentTranscriptHint,
		transcriptPath: string | undefined,
		parentSessionId: string | undefined,
	): SubagentParentResolution | undefined {
		const roster = this.subagentsByTerminal.get(terminalId);
		const existing = roster?.get(subagentId);
		if (existing && isPlaced(existing)) return undefined;
		const siblings = roster
			? [...roster.values()].filter((sibling) => sibling.id !== subagentId)
			: [];
		return harness.resolveParent(hint, {
			...(parentSessionId ? { parentSessionId } : {}),
			siblings,
			...((transcriptPath ?? existing?.transcriptPath)
				? { transcriptPath: transcriptPath ?? existing?.transcriptPath }
				: {}),
		});
	}

	/**
	 * A child's transcript for the pane: the roster entry plus its parsed
	 * transcript, or null when the child is unknown. `transcript` is null
	 * while the child has not flushed its first record.
	 */
	getSubagentTranscript(
		terminalId: string,
		subagentId: string,
	): {
		subagent: TerminalSubagent;
		transcript: SubagentTranscript | null;
	} | null {
		const subagent = this.getSubagent(terminalId, subagentId);
		if (!subagent) return null;
		const harness = getSubagentHarness(
			this.byTerminal.get(terminalId)?.agentId,
		);
		return {
			subagent,
			transcript: subagent.transcriptPath
				? readSubagentTranscript(harness, subagent.transcriptPath)
				: null,
		};
	}

	/**
	 * A child by id, live or recently ended, for the subagent transcript pane.
	 * Only paths the roster recorded are ever read, so the renderer cannot
	 * point the host at an arbitrary file.
	 */
	getSubagent(
		terminalId: string,
		subagentId: string,
	): TerminalSubagent | undefined {
		this.pruneSubagents(terminalId);
		return this.subagentsByTerminal.get(terminalId)?.get(subagentId);
	}

	markTerminalExited(terminalId: string): void {
		this.endBinding(terminalId, "terminal-exited", Date.now());
	}

	/**
	 * A deliberate kill (pane close, CLI kill, resume cleanup). Unlike
	 * markTerminalExited the row never becomes a resume candidate — a session
	 * the user chose to end must not be resurrected by auto-resume.
	 */
	markTerminalDisposed(terminalId: string): void {
		this.endBinding(terminalId, "disposed", Date.now());
	}

	/**
	 * Escape hatch for wedged working/permission state (an agent whose final
	 * Stop hook never fired — interrupts fire no hook at all). Forces the
	 * workspace's bindings (or just `terminalId`'s) to `Stop`, keeping
	 * lastEventAt so seen-gating still resolves to idle. Live agents
	 * re-assert within seconds via their next hook event, so clearing a
	 * genuinely working agent self-corrects.
	 */
	clearWorkspaceStatuses(workspaceId: string, onlyTerminalId?: string): void {
		let changed = false;
		for (const [terminalId, binding] of this.byTerminal) {
			if (binding.workspaceId !== workspaceId) continue;
			if (onlyTerminalId !== undefined && terminalId !== onlyTerminalId)
				continue;
			if (binding.lastEventType === "Stop") continue;
			const next: TerminalAgentBinding = { ...binding, lastEventType: "Stop" };
			this.byTerminal.set(terminalId, next);
			this.persistence?.upsert(next);
			changed = true;
		}
		if (changed) this.emit("change", workspaceId);
	}

	get(terminalId: string): TerminalAgentBinding | undefined {
		const binding = this.byTerminal.get(terminalId);
		return binding && this.withSubagents(binding);
	}

	listByWorkspace(
		workspaceId: string,
		filter?: TerminalAgentBindingListFilter,
	): TerminalAgentBinding[] {
		if (this.persistence?.listLiveByWorkspace) {
			return this.persistence
				.listLiveByWorkspace(workspaceId, filter)
				.map((binding) => this.withSubagents(binding));
		}
		const out: TerminalAgentBinding[] = [];
		for (const binding of this.byTerminal.values()) {
			if (binding.workspaceId !== workspaceId) continue;
			if (filter?.agentId && binding.agentId !== filter.agentId) continue;
			if (filter?.definitionId && binding.definitionId !== filter.definitionId)
				continue;
			out.push(this.withSubagents(binding));
		}
		return out;
	}

	list(): TerminalAgentBinding[] {
		if (this.persistence?.listLive) {
			return this.persistence
				.listLive()
				.map((binding) => this.withSubagents(binding));
		}
		return [...this.byTerminal.values()].map((binding) =>
			this.withSubagents(binding),
		);
	}

	/**
	 * Attach the terminal's live and recently ended subagents to a binding
	 * read. Stale entries are settled here rather than on a timer so the
	 * store stays passive.
	 */
	private withSubagents(binding: TerminalAgentBinding): TerminalAgentBinding {
		const roster = this.pruneSubagents(binding.terminalId);
		if (!roster) return binding;
		const live: TerminalSubagent[] = [];
		const ended: TerminalSubagent[] = [];
		for (const subagent of roster.values()) {
			(subagent.endedAt === undefined ? live : ended).push(subagent);
		}
		live.sort((a, b) => a.startedAt - b.startedAt);
		ended.sort((a, b) => (a.endedAt ?? 0) - (b.endedAt ?? 0));
		return {
			...binding,
			...(live.length > 0 ? { subagents: live } : {}),
			...(ended.length > 0 ? { endedSubagents: ended } : {}),
		};
	}

	/**
	 * Mark children that went quiet without a stop as stopped, and drop
	 * ended children past their retention. Runs on read rather than on a
	 * timer so the store stays passive.
	 */
	private pruneSubagents(
		terminalId: string,
	): Map<string, TerminalSubagent> | undefined {
		const roster = this.subagentsByTerminal.get(terminalId);
		if (!roster) return undefined;
		const now = Date.now();
		for (const [id, subagent] of roster) {
			if (subagent.endedAt === undefined) {
				if (subagent.lastEventAt < now - SUBAGENT_STALE_MS) {
					roster.set(id, {
						...subagent,
						status: "stopped",
						endedAt: subagent.lastEventAt + SUBAGENT_STALE_MS,
						endReason: "stale",
					});
				}
			} else if (subagent.endedAt < now - SUBAGENT_ENDED_RETENTION_MS) {
				roster.delete(id);
			}
		}
		if (roster.size === 0) {
			this.subagentsByTerminal.delete(terminalId);
			return undefined;
		}
		return roster;
	}

	findActive(
		workspaceId: string,
		agentId: TerminalAgentId,
		definitionId?: AgentDefinitionId,
	): TerminalAgentBinding | undefined {
		if (this.persistence?.findLiveActive) {
			return this.persistence.findLiveActive(
				workspaceId,
				agentId,
				definitionId,
			);
		}
		let best: TerminalAgentBinding | undefined;
		for (const binding of this.byTerminal.values()) {
			if (binding.workspaceId !== workspaceId) continue;
			if (binding.agentId !== agentId) continue;
			if (definitionId !== undefined && binding.definitionId !== definitionId)
				continue;
			if (!best || binding.lastEventAt > best.lastEventAt) {
				best = binding;
			}
		}
		return best;
	}

	/**
	 * Drop the binding from the live view. With markEnded persistence the row
	 * is retained (stamped ended) so `agentSessionId` survives for resume;
	 * without it, hard-delete as before.
	 */
	private endBinding(
		terminalId: string,
		reason: TerminalAgentEndReason,
		endedAt: number,
	): void {
		const existing = this.byTerminal.get(terminalId);
		this.byTerminal.delete(terminalId);
		this.subagentsByTerminal.delete(terminalId);

		let marked: { workspaceId: string } | undefined;
		if (this.persistence?.markEnded) {
			marked = this.persistence.markEnded(terminalId, reason, endedAt);
		} else if (existing) {
			this.persistence?.delete(terminalId);
		}

		const workspaceId = marked?.workspaceId ?? existing?.workspaceId;
		if (workspaceId) this.emit("change", workspaceId);
	}
}

function clipActivitySummary(summary: string): string {
	const trimmed = summary.trim();
	return trimmed.length > MAX_ACTIVITY_SUMMARY_CHARS
		? `${trimmed.slice(0, MAX_ACTIVITY_SUMMARY_CHARS)}…`
		: trimmed;
}

function isPlaced(subagent: TerminalSubagent): boolean {
	return (
		subagent.parentSubagentId !== undefined || subagent.parentUnknown === true
	);
}

/**
 * The tree placement to carry on the next roster entry: an existing
 * placement wins, otherwise the resolution from this event, if any.
 */
function placementOf(
	existing: TerminalSubagent | undefined,
	resolution: SubagentParentResolution | undefined,
): Pick<TerminalSubagent, "parentSubagentId" | "parentUnknown"> | undefined {
	if (existing && isPlaced(existing)) {
		return {
			...(existing.parentSubagentId
				? { parentSubagentId: existing.parentSubagentId }
				: {}),
			...(existing.parentUnknown ? { parentUnknown: true } : {}),
		};
	}
	if (!resolution) return undefined;
	if (!resolution.known) return { parentUnknown: true };
	return resolution.parentSubagentId
		? { parentSubagentId: resolution.parentSubagentId }
		: {};
}
