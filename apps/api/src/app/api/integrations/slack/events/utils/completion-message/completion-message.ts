export type AgentTurnEnd = "stopped" | "failed" | "exited" | "waiting";

export interface CompletionPullRequest {
	url: string;
	number: number;
	title: string;
	state: string;
}

export interface CompletionMessageInput {
	agentLabel: string;
	workspaceName: string | null;
	workspaceBranch: string | null;
	end: AgentTurnEnd;
	summary: string | null;
	pullRequest: CompletionPullRequest | null;
}

export interface CompletionMessage {
	/** Plain fallback for notifications and clients without block support. */
	text: string;
	/** Body for Slack's Markdown block. */
	markdown: string;
}

const MAX_SUMMARY_CHARS = 280;
const MAX_LABEL_CHARS = 80;
const TURN_BOUNDARY = /\n\n(?=(?:User|Assistant): )/;
const ASSISTANT_PREFIX = "Assistant: ";

function collapse(text: string, maxChars: number): string {
	const oneLine = text
		// biome-ignore lint/suspicious/noControlCharactersInRegex: newlines and control bytes become spaces
		.replace(/[\u0000-\u001f\u007f]+/g, " ")
		.replace(/(^|\s)#{1,6}\s+/g, "$1")
		.replace(/\s+/g, " ")
		.trim();
	return oneLine.length > maxChars
		? `${oneLine.slice(0, maxChars - 1)}…`
		: oneLine;
}

/**
 * The agent's last reply, from a harness transcript laid out as
 * "User: …\n\nAssistant: …" turns, as one short line. Null when the
 * transcript has no assistant turn.
 */
export function lastAssistantLine(
	transcript: string | null | undefined,
): string | null {
	if (!transcript) return null;
	const turns = transcript.split(TURN_BOUNDARY);
	for (let index = turns.length - 1; index >= 0; index--) {
		const turn = turns[index];
		if (!turn?.startsWith(ASSISTANT_PREFIX)) continue;
		const line = collapse(
			turn.slice(ASSISTANT_PREFIX.length),
			MAX_SUMMARY_CHARS,
		);
		return line || null;
	}
	return null;
}

function pullRequestVerb(state: string): string {
	switch (state) {
		case "merged":
			return "Merged";
		case "closed":
			return "Closed";
		case "draft":
			return "Drafted";
		default:
			return "Opened";
	}
}

const END_VERB: Record<AgentTurnEnd, string> = {
	stopped: "finished",
	failed: "hit an error",
	exited: "exited",
	waiting: "is waiting for a permission",
};

export function buildCompletionMessage(
	input: CompletionMessageInput,
): CompletionMessage {
	const agent = collapse(input.agentLabel, MAX_LABEL_CHARS) || "The agent";
	const workspace = input.workspaceName
		? collapse(input.workspaceName, MAX_LABEL_CHARS)
		: "";
	const branch = input.workspaceBranch
		? collapse(input.workspaceBranch, MAX_LABEL_CHARS)
		: "";
	const verb = END_VERB[input.end];
	const tail =
		input.end === "exited"
			? " before reporting back"
			: input.end === "waiting"
				? "; open the workspace in Superset to answer it"
				: "";

	const whereText = workspace
		? ` in ${workspace}${branch ? ` (${branch})` : ""}`
		: "";
	const whereMarkdown = workspace
		? ` in **${workspace}**${branch ? ` (\`${branch}\`)` : ""}`
		: "";

	const lines = [`**${agent} ${verb}**${whereMarkdown}${tail}.`];
	const plain = [`${agent} ${verb}${whereText}${tail}.`];
	if (input.summary) {
		lines.push(`> ${input.summary}`);
		plain.push(input.summary);
	}
	if (input.pullRequest) {
		const pr = input.pullRequest;
		const title = collapse(pr.title, MAX_LABEL_CHARS).replace(/[[\]]/g, "");
		lines.push(
			`${pullRequestVerb(pr.state)} [#${pr.number}${title ? ` ${title}` : ""}](${pr.url})`,
		);
		plain.push(
			`${pullRequestVerb(pr.state)} #${pr.number}${title ? ` ${title}` : ""} ${pr.url}`,
		);
	} else if (input.end === "stopped") {
		lines.push("No pull request yet.");
		plain.push("No pull request yet.");
	}

	// The plain text is what notifications and screen readers get; it carries
	// the same details as the block, without the formatting.
	return {
		text: plain.join(" "),
		markdown: lines.join("\n"),
	};
}
