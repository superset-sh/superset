import { EventEmitter } from "node:events";
import type { AgentDefinitionId } from "@superset/shared/agent-catalog";
import type { TerminalAgentBinding, TerminalAgentId } from "./types";

interface RecordEventInput {
	terminalId: string;
	workspaceId: string;
	eventType: string;
	agentId?: TerminalAgentId;
	agentSessionId?: string;
	definitionId?: AgentDefinitionId;
	occurredAt: number;
}

interface ListFilter {
	agentId?: TerminalAgentId;
	definitionId?: AgentDefinitionId;
}

const EXIT_EVENT_TYPES = new Set(["Detached", "exit", "error"]);

/**
 * In-process tracker for which agent is alive in which terminal. Populated
 * by the hook receiver, drained on terminal exit. Absence is the only
 * signal — no history is retained.
 *
 * Emits `"change"` with the affected workspaceId after every mutation.
 */
export class TerminalAgentStore extends EventEmitter {
	private readonly byTerminal = new Map<string, TerminalAgentBinding>();

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

		if (EXIT_EVENT_TYPES.has(eventType)) {
			this.deleteTerminal(terminalId);
			return;
		}

		const existing = this.byTerminal.get(terminalId);
		if (!agentId && !existing) return;

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

		const next: TerminalAgentBinding = {
			terminalId,
			workspaceId,
			agentId: nextAgentId,
			agentSessionId: agentSessionId ?? prior?.agentSessionId,
			definitionId: definitionId ?? prior?.definitionId,
			startedAt:
				prior !== undefined && !sessionChanged ? prior.startedAt : occurredAt,
			lastEventAt: occurredAt,
			lastEventType: eventType,
		};

		this.byTerminal.set(terminalId, next);
		this.emit("change", workspaceId);
	}

	markTerminalExited(terminalId: string): void {
		this.deleteTerminal(terminalId);
	}

	get(terminalId: string): TerminalAgentBinding | undefined {
		return this.byTerminal.get(terminalId);
	}

	listByWorkspace(
		workspaceId: string,
		filter?: ListFilter,
	): TerminalAgentBinding[] {
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

	findActive(
		workspaceId: string,
		agentId: TerminalAgentId,
		definitionId?: AgentDefinitionId,
	): TerminalAgentBinding | undefined {
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

	private deleteTerminal(terminalId: string): void {
		const existing = this.byTerminal.get(terminalId);
		if (!existing) return;
		this.byTerminal.delete(terminalId);
		this.emit("change", existing.workspaceId);
	}
}
