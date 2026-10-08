import type { BackgroundTaskKind } from "@superset/chat/protocol";
import type { TerminalAgentBinding } from "renderer/hooks/host-service/useTerminalAgentBindings";

export type BackgroundWork = {
	key: string;
	kind: BackgroundTaskKind;
	name: string;
	detail?: string;
	startedAtMs: number;
	terminalId: string;
	stop?:
		| { type: "chat"; chatSessionId: string; taskId: string }
		| { type: "terminal" };
	detachedTerminal?: true;
	subagent?: {
		id: string;
		agentId: TerminalAgentBinding["agentId"];
		agentType?: string;
	};
};

export type DetachedTerminal = {
	terminalId: string;
	title?: string | null;
	createdAt?: number;
};

export function collectBackgroundWork(
	bindings: Iterable<TerminalAgentBinding>,
	detachedTerminals: readonly DetachedTerminal[] = [],
): { processes: BackgroundWork[]; subagents: BackgroundWork[] } {
	const processes: BackgroundWork[] = detachedTerminals.map((terminal) => ({
		key: `terminal:${terminal.terminalId}`,
		kind: "process",
		name: terminal.title ?? "",
		startedAtMs: terminal.createdAt ?? 0,
		terminalId: terminal.terminalId,
		stop: { type: "terminal" },
		detachedTerminal: true,
	}));
	const subagents: BackgroundWork[] = [];
	for (const binding of bindings) {
		for (const task of binding.backgroundTasks ?? []) {
			const work: BackgroundWork = {
				key: `${binding.terminalId}:${task.id}`,
				kind: task.kind,
				name: task.name,
				...(task.detail ? { detail: task.detail } : {}),
				startedAtMs: task.startedAtMs,
				terminalId: binding.terminalId,
				...(task.canStop && binding.chatSessionId
					? {
							stop: {
								type: "chat" as const,
								chatSessionId: binding.chatSessionId,
								taskId: task.id,
							},
						}
					: {}),
			};
			(task.kind === "subagent" ? subagents : processes).push(work);
		}
		for (const subagent of binding.subagents ?? []) {
			subagents.push({
				key: `${binding.terminalId}:${subagent.id}`,
				kind: "subagent",
				name: subagent.agentType ?? "",
				startedAtMs: subagent.startedAt,
				terminalId: binding.terminalId,
				subagent: {
					id: subagent.id,
					agentId: binding.agentId,
					...(subagent.agentType ? { agentType: subagent.agentType } : {}),
				},
			});
		}
	}
	const byStart = (a: BackgroundWork, b: BackgroundWork) =>
		a.startedAtMs - b.startedAtMs;
	return {
		processes: processes.sort(byStart),
		subagents: subagents.sort(byStart),
	};
}
