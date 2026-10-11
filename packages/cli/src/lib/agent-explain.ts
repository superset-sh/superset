import {
	type AgentRunState,
	agentRunState,
} from "@superset/shared/agent-status";
import { formatDistanceStrict } from "date-fns";

export interface ExplainedBinding {
	agentId: string;
	lastEventType: string;
	lastEventAt: number;
	startedAt: number;
	endedAt?: number | null;
	endReason?: string | null;
	subagents?: { agentType?: string; startedAt: number }[];
	queuedPrompts?: number;
}

export interface ExplainInput {
	binding: ExplainedBinding | null;
	terminalAlive: boolean;
	processRunning: boolean;
	now: number;
}

export interface AgentExplanation {
	state: AgentRunState | "exited" | "none";
	because: string;
	details: string[];
}

const EVENT_MEANING: Record<string, string> = {
	Start: "a prompt was submitted or a tool just ran, so a turn is in progress",
	PermissionRequest:
		"it asked for permission to run a tool and is waiting on you",
	Stop: "it finished its turn",
	Failed: "its turn failed",
	Attached: "it launched and has not been given a prompt yet",
};

const END_MEANING: Record<string, string> = {
	detached: "the agent ended its own session (for example /exit)",
	"terminal-exited":
		"the terminal died under it (crash, kill, or restart); it can be resumed",
	disposed: "the terminal was closed on purpose",
	resumed: "it was resumed in another terminal",
};

/** Why `agents wait` and `panes list` show the state they do for this terminal. */
export function explainAgent({
	binding,
	terminalAlive,
	processRunning,
	now,
}: ExplainInput): AgentExplanation {
	const ago = (at: number) => `${formatDistanceStrict(at, now)} ago`;
	if (!binding) {
		if (terminalAlive && processRunning) {
			return {
				state: "starting",
				because:
					"something is running in the terminal, but no agent hook has reached Superset yet. If this stays, the agent was not started by Superset or its hooks are not installed",
				details: [],
			};
		}
		return {
			state: "none",
			because: terminalAlive
				? "the terminal is a plain shell with no agent in it"
				: "the terminal is not running and never reported an agent",
			details: [],
		};
	}
	if (binding.endedAt != null) {
		const reason =
			END_MEANING[binding.endReason ?? ""] ?? "the agent's session ended";
		return processRunning
			? {
					state: "starting",
					because: `the last ${binding.agentId} session ended ${ago(binding.endedAt)}, and something new is running in the terminal that has not sent a hook yet`,
					details: [`Earlier session: ${reason}.`],
				}
			: {
					state: "exited",
					because: `${binding.agentId} ended ${ago(binding.endedAt)} because ${reason}`,
					details: [],
				};
	}
	const state = agentRunState(binding.lastEventType);
	const meaning =
		EVENT_MEANING[binding.lastEventType] ?? "no turn is in progress";
	const details = [`Started ${ago(binding.startedAt)}.`];
	for (const subagent of binding.subagents ?? []) {
		details.push(
			`Subagent ${subagent.agentType ?? "task"} running for ${formatDistanceStrict(subagent.startedAt, now)}.`,
		);
	}
	if (binding.queuedPrompts) {
		details.push(`${binding.queuedPrompts} prompt(s) queued behind this turn.`);
	}
	if (state === "working") {
		details.push(
			"An interrupt (Esc or Ctrl+C) sends no hook. Superset clears this state when the interrupt comes through Superset; one typed elsewhere can leave it working.",
		);
	}
	return {
		state,
		because: `its last hook event was ${binding.lastEventType} (${ago(binding.lastEventAt)}), which means ${meaning}`,
		details,
	};
}
