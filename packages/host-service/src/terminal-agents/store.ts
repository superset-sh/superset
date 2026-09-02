import { EventEmitter } from "node:events";
import type { AgentDefinitionId } from "@superset/shared/agent-catalog";
import type {
	TerminalAgentBinding,
	TerminalAgentEndReason,
	TerminalAgentId,
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
		return this.byTerminal.get(terminalId);
	}

	listByWorkspace(
		workspaceId: string,
		filter?: TerminalAgentBindingListFilter,
	): TerminalAgentBinding[] {
		if (this.persistence?.listLiveByWorkspace) {
			return this.persistence.listLiveByWorkspace(workspaceId, filter);
		}
		const out: TerminalAgentBinding[] = [];
		for (const binding of this.byTerminal.values()) {
			if (binding.workspaceId !== workspaceId) continue;
			if (filter?.agentId && binding.agentId !== filter.agentId) continue;
			if (filter?.definitionId && binding.definitionId !== filter.definitionId)
				continue;
			out.push(binding);
		}
		return out;
	}

	list(): TerminalAgentBinding[] {
		if (this.persistence?.listLive) {
			return this.persistence.listLive();
		}
		return [...this.byTerminal.values()];
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
