import type { AvailableCommand, UserContent } from "@superset/chat/protocol";

export const MAX_GOAL_CONTINUATIONS = 20;

const COMMAND = /^\/goal(?:\s+([\s\S]*))?$/;
const CLEAR_WORDS = new Set(["clear", "stop", "off", "cancel"]);
const COMPLETE_LINE = /^\s*GOAL_COMPLETE\s*$/m;
const BLOCKED_LINE = /^\s*GOAL_BLOCKED:\s*(.*\S)\s*$/m;

const GOAL_COMMAND: AvailableCommand = {
	name: "goal",
	description: "Keep the agent working until a goal is reached",
	hint: "[goal | clear]",
};

export type GoalCommand =
	| { kind: "show" }
	| { kind: "clear" }
	| { kind: "set"; text: string };

export type GoalOutcome =
	| { kind: "complete" }
	| { kind: "blocked"; reason: string }
	| { kind: "unfinished" };

export function parseGoalCommand(content: UserContent[]): GoalCommand | null {
	const text = content
		.flatMap((part) =>
			part.type === "text" && !part.hidden ? [part.text] : [],
		)
		.join("\n")
		.trim();
	const match = COMMAND.exec(text);
	if (!match) return null;
	const argument = match[1]?.trim() ?? "";
	if (argument === "") return { kind: "show" };
	if (CLEAR_WORDS.has(argument.toLowerCase())) return { kind: "clear" };
	return { kind: "set", text: argument };
}

export function readGoalOutcome(agentText: string): GoalOutcome {
	if (COMPLETE_LINE.test(agentText)) return { kind: "complete" };
	const blocked = BLOCKED_LINE.exec(agentText);
	if (blocked?.[1]) return { kind: "blocked", reason: blocked[1] };
	return { kind: "unfinished" };
}

const REPORTING_RULES = [
	"When the goal is fully achieved and verified, end your final message with a line that reads exactly GOAL_COMPLETE.",
	"If you cannot make more progress without the user, end your final message with a line that reads GOAL_BLOCKED: followed by the reason.",
	"Otherwise, stop when you finish a meaningful step. You will be asked to continue.",
].join("\n");

/** Wrapped in a tag the Superset bookkeeping reader knows, so a transcript replay shows a note, not the brief. */
export function goalBrief(goal: string): string {
	return `<goal>Work toward this goal over as many turns as it takes:\n\n${goal}\n\n${REPORTING_RULES}</goal>`;
}

export function goalContinuation(goal: string): string {
	return `<goal-continuation>Continue to work toward the goal:\n\n${goal}\n\n${REPORTING_RULES}</goal-continuation>`;
}

/** The host answers `/goal` itself, so it replaces any `goal` the agent offers. */
export function withGoalCommand(
	commands: AvailableCommand[],
): AvailableCommand[] {
	return [
		...commands.filter((command) => command.name !== "goal"),
		GOAL_COMMAND,
	];
}
