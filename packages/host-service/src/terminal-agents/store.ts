import { EventEmitter } from "node:events";
import type { AgentDefinitionId } from "@superset/shared/agent-catalog";
import {
	getSubagentHarness,
	isTrustedTranscriptPath,
	readSubagentTranscript,
	type SubagentTranscriptHint,
} from "./subagent-harnesses";
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
	/** Bounded failure class from a `Failed` event's hook payload. */
	errorType?: string;
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
	transcriptPath?: string;
	occurredAt: number;
}

interface RecordSubagentHookInput {
	terminalId: string;
	workspaceId: string;
	/** Raw hook event name from the child. */
	eventType: string;
	subagentId: string;
	agentType?: string;
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

// The agent is mid-turn on these; anything else is idle or session-lifetime
// noise. A busy row moving to a stopped one is the moment a limit stop would
// have happened, and this records it. Nothing reads it yet: the engine
// corroborates a limit stop against the screen and the quota windows, not by
// date. Kept because the record is only correct if it is kept correctly, and
// the rules below are the ones a later dating consumer would need.
const BUSY_EVENT_TYPES = new Set(["Start", "PermissionRequest"]);
const STOPPED_EVENT_TYPES = new Set(["Stop", "Failed"]);

/**
 * A subagent whose SubagentStop never arrived (parent interrupted, hook
 * dropped) must not sit in the roster forever. Live children re-assert on
 * every tool call, so anything quiet this long is gone.
 */
const SUBAGENT_STALE_MS = 10 * 60_000;

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
			errorType,
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

		const lastEventType = preservedLifecycleState ?? eventType;

		// Only a real busy → stopped move stamps the transition: a second Stop
		// leaves the first one's timestamp in place, so the moment recorded is
		// the stop itself, not the last hook that happened to arrive after it.
		const stoppedNow =
			prior !== undefined &&
			BUSY_EVENT_TYPES.has(prior.lastEventType) &&
			STOPPED_EVENT_TYPES.has(lastEventType);

		// A session start, whatever the agent called it: the hook router
		// normalizes every flavour of SessionStart to "Attached"
		// (events/map-event-type.ts), and a relaunch of the same conversation
		// is reported as "Attached" too, keeping the session id it resumed. So
		// "Attached" — never "SessionStart" — is the start this store sees.
		// But only when it really starts something: an "Attached" whose
		// lifecycle state was preserved above arrived *inside* a session that
		// already moved on (the wrapper's delayed launch report, a
		// resume/compact/clear SessionStart), and clearing there would leave
		// the row saying the turn failed with no failure class and no date.
		const sessionStarted =
			eventType === "Attached" && preservedLifecycleState === undefined;

		// A transition belongs to the session it happened in. A session start
		// or a different agent session id in the same terminal starts over,
		// exactly as `lastFailure` does — otherwise a fresh session would carry
		// the previous session's stop as its own recorded moment.
		const carriedTransitionAt =
			sessionChanged || sessionStarted ? undefined : prior?.lastTransitionAt;

		// A failure describes the turn it ended, so it is dropped the moment
		// the session moves on: a new turn, a session start, or a different
		// agent session in the same terminal. Carrying it forward leaves a
		// rate-limit stop arming the engine's limit-stop fallback against a
		// live session. The same holds for a failure arriving late *from* a
		// session that already moved on, so it is not recorded either.
		// The trade: if the store missed a new session's earlier events, a
		// "Failed" that is the first event seen for the new session while
		// `prior` still holds the old one is discarded. Deliberate — missing a
		// switch beats killing a live session.
		// Only "Start" begins a turn. "PermissionRequest" is busy for
		// `stoppedNow` above but is not a turn boundary: "PreToolUse" folds
		// into it (events/map-event-type.ts) and always follows a "Start" that
		// already cleared the failure. That fold also covers an idle
		// "Notification", which would erase the failure a minute after the stop
		// with no turn having begun — but this repo's Claude wrapper never
		// registers that hook (CLAUDE_MANAGED_EVENTS), so it is unreachable for
		// the agents the engine acts on.
		const turnStarted = eventType === "Start" || sessionStarted;
		const lastFailure =
			eventType === "Failed" && errorType && !sessionChanged
				? { errorType, at: occurredAt }
				: turnStarted || sessionChanged
					? undefined
					: prior?.lastFailure;

		const next: TerminalAgentBinding = {
			terminalId,
			workspaceId,
			agentId: nextAgentId,
			// Any id that arrives wins, because arrival order is the only order
			// there is: the hook payload carries no sequence and `occurredAt` is
			// stamped on receipt, so a straggler always looks newer. A late event
			// from a session this terminal already moved on from therefore rewrites
			// this row's identity, and that id is what a resume would target. No
			// guard fixes it from here — rejecting an id seen before breaks the
			// user's own `--resume` in this pane (see the "Attached" note above),
			// and rejecting a differing id on anything but "Attached" breaks Codex,
			// whose TUI fires nothing until the first turn, leaving a pane with no
			// resume candidate at all. It needs an origin-side sequence in the hook.
			agentSessionId: agentSessionId ?? prior?.agentSessionId,
			definitionId: definitionId ?? prior?.definitionId,
			startedAt:
				prior !== undefined && !sessionChanged ? prior.startedAt : occurredAt,
			lastEventAt: occurredAt,
			lastEventType,
			lastFailure,
			lastTransitionAt: stoppedNow ? occurredAt : carriedTransitionAt,
		};

		this.byTerminal.set(terminalId, next);
		this.persistence?.upsert(next);
		this.emit("change", workspaceId);
	}

	/**
	 * A hook fired inside a subagent of the terminal's agent. Any event keeps
	 * the child live (lost SubagentStarts self-heal on its next tool call);
	 * a stop drops it. Never touches the parent binding's lifecycle state.
	 */
	recordSubagentEvent(input: RecordSubagentEventInput): void {
		const {
			terminalId,
			workspaceId,
			eventType,
			subagentId,
			agentType,
			transcriptPath,
		} = input;
		const occurredAt = input.occurredAt;
		const roster = this.subagentsByTerminal.get(terminalId);
		const existing = roster?.get(subagentId);

		const harness = getSubagentHarness(
			this.byTerminal.get(terminalId)?.agentId,
		);
		if (harness.isStopEvent(eventType)) {
			if (!existing || existing.endedAt !== undefined) return;
			roster?.set(subagentId, {
				...existing,
				...(transcriptPath ? { transcriptPath } : {}),
				lastEventAt: occurredAt,
				endedAt: occurredAt,
			});
			this.emit("change", workspaceId);
			return;
		}

		// A child can only run under a live parent; a straggler after the
		// terminal ended must not recreate a roster for it.
		if (!this.byTerminal.has(terminalId)) return;

		const nextType = agentType ?? existing?.agentType;
		const nextPath = transcriptPath ?? existing?.transcriptPath;
		const next: TerminalSubagent = {
			id: subagentId,
			...(nextType ? { agentType: nextType } : {}),
			...(nextPath ? { transcriptPath: nextPath } : {}),
			// A stopped child that speaks again (Codex send_input) is live again.
			startedAt:
				existing && existing.endedAt === undefined
					? existing.startedAt
					: occurredAt,
			lastEventAt: occurredAt,
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
	 * belongs to the current session and where the child's transcript
	 * lives; the path is kept only when it passes the trust check, since the
	 * endpoint is unauthenticated. Returns false when the event was dropped.
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
		this.recordSubagentEvent({
			terminalId: input.terminalId,
			workspaceId: input.workspaceId,
			eventType: input.eventType,
			subagentId: input.subagentId,
			...(input.agentType ? { agentType: input.agentType } : {}),
			...(transcriptPath ? { transcriptPath } : {}),
			occurredAt: input.occurredAt,
		});
		return true;
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
	 * Attach the terminal's live subagents to a binding read. Stale entries
	 * are dropped here rather than on a timer so the store stays passive.
	 */
	private withSubagents(binding: TerminalAgentBinding): TerminalAgentBinding {
		const roster = this.pruneSubagents(binding.terminalId);
		if (!roster) return binding;
		const live = [...roster.values()]
			.filter((subagent) => subagent.endedAt === undefined)
			.sort((a, b) => a.startedAt - b.startedAt);
		return live.length > 0 ? { ...binding, subagents: live } : binding;
	}

	/**
	 * Drop children that went quiet without a stop, and ended children past
	 * their retention. Runs on read rather than on a timer so the store stays
	 * passive.
	 */
	private pruneSubagents(
		terminalId: string,
	): Map<string, TerminalSubagent> | undefined {
		const roster = this.subagentsByTerminal.get(terminalId);
		if (!roster) return undefined;
		const now = Date.now();
		for (const [id, subagent] of roster) {
			const expired =
				subagent.endedAt === undefined
					? subagent.lastEventAt < now - SUBAGENT_STALE_MS
					: subagent.endedAt < now - SUBAGENT_ENDED_RETENTION_MS;
			if (expired) roster.delete(id);
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
