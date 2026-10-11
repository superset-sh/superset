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
	/** Null when the host could not say whether a process runs in the shell. */
	processRunning: boolean | null;
	now: number;
}

export interface AgentExplanation {
	state: AgentRunState | "exited" | "none";
	/** The agent the evidence identifies; null when nothing names one. */
	agentId: string | null;
	headline: string;
	because: string;
	details: string[];
}

const EVENT_MEANING: Record<string, string> = {
	Start: "a turn is in progress (a prompt was submitted or a tool just ran)",
	PermissionRequest:
		"it asked for permission to run a tool and is waiting on you",
	// Superset also records an interrupt as Stop, since agents send no hook for it.
	Stop: "its turn ended: it finished, or it was interrupted",
	Failed: "its turn failed",
	Attached: "it launched and has not been given a prompt yet",
};

const END_MEANING: Record<string, string> = {
	detached: "the agent ended its own session (for example /exit)",
	"terminal-exited":
		"the terminal died under it (crash, kill or restart); it can be resumed",
	disposed: "the terminal was closed on purpose",
	resumed: "it was resumed in another terminal",
};

const UNCHECKED =
	"The host could not say whether a process is running in the terminal.";

/** Why `agents wait` and `panes list` show the state they do for a terminal. */
export function explainAgent({
	binding,
	terminalAlive,
	processRunning,
	now,
}: ExplainInput): AgentExplanation {
	const ago = (at: number) => `${formatDistanceStrict(at, now)} ago`;
	const unchecked = processRunning === null ? [UNCHECKED] : [];

	if (!binding) {
		if (!terminalAlive) {
			return {
				state: "none",
				agentId: null,
				headline: "No such terminal running.",
				because:
					"there is no live terminal with this id and no agent was ever recorded for it. Check the id with `superset terminals list`",
				details: [],
			};
		}
		if (processRunning === false) {
			return {
				state: "none",
				agentId: null,
				headline: "No agent in this terminal.",
				because: "the terminal is a plain shell with nothing running in it",
				details: [],
			};
		}
		return {
			state: "starting",
			agentId: null,
			headline: "No agent hook from this terminal yet.",
			because:
				"something may be running in the terminal, but no agent hook has reached Superset. It is a program that is not an agent, an agent still starting, or an agent whose hooks are not installed",
			details: unchecked,
		};
	}

	if (binding.endedAt != null) {
		const reason =
			END_MEANING[binding.endReason ?? ""] ?? "the agent's session ended";
		const ended = `${binding.agentId} ended ${ago(binding.endedAt)} because ${reason}`;
		if (processRunning === false) {
			return {
				state: "exited",
				agentId: binding.agentId,
				headline: `${binding.agentId} has exited.`,
				because: ended,
				details: [],
			};
		}
		return {
			state: "starting",
			agentId: null,
			headline: "No agent hook from this terminal yet.",
			because: `${ended}. Something may be running in the terminal now, and it has not sent a hook`,
			details: unchecked,
		};
	}

	const state = agentRunState(binding.lastEventType);
	const meaning =
		EVENT_MEANING[binding.lastEventType] ?? "no turn is in progress";
	const details = [
		`The last hook arrived ${ago(binding.lastEventAt)}; the session started ${ago(binding.startedAt)}.`,
	];
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
			"Agents send no hook for an interrupt. Superset clears this state when the interrupt comes through Superset; one typed elsewhere can leave it working.",
		);
	}
	return {
		state,
		agentId: binding.agentId,
		headline: `${binding.agentId} is ${state}.`,
		because: `its recorded event is ${binding.lastEventType}, which means ${meaning}`,
		details,
	};
}
