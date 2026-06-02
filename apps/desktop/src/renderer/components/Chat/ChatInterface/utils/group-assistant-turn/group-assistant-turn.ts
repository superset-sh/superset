/**
 * Turn-level grouping for assistant messages — the "agent inspector" flavor.
 *
 * The Superset chat renders an assistant message as a flat stream of content
 * parts. The vendored `agent-inspector` instead bundles a turn into a single
 * group with a one-line summary ("3 tools · 1 message"), an overall status,
 * and an always-visible final answer. This helper computes that summary from
 * the raw parts so the renderer can present the same grouping.
 */

export type TurnStatus = "in_progress" | "error" | "complete";

interface AssistantTurnPartLike {
	type: string;
	name?: string;
	isError?: boolean;
}

export interface AssistantTurnSummary {
	thinkingCount: number;
	/** Regular tool calls (excludes subagents). */
	toolCount: number;
	/** Tool calls whose name is `subagent`. */
	subagentCount: number;
	/** Text parts that are NOT the final answer (intermediate narration). */
	outputCount: number;
	imageCount: number;
	status: TurnStatus;
	/** Index of the last text part — surfaced as the always-visible answer. */
	lastTextIndex: number;
	/** Whether the turn has any tool/thinking work worth grouping. */
	hasSteps: boolean;
}

const SUBAGENT_TOOL_NAME = "subagent";
const TOKEN_THINKING = "reasoning";
const TOKEN_TOOL = "tool call";
const TOKEN_SUBAGENT = "subagent";
const TOKEN_MESSAGE = "message";

/**
 * Summarize the parts of a single assistant message into turn-level metadata.
 * `tool_result` parts are not counted separately — they are folded into their
 * matching `tool_call` the same way the renderer links them.
 */
export function summarizeAssistantTurn(
	parts: readonly AssistantTurnPartLike[],
	options: { isStreaming?: boolean; errored?: boolean } = {},
): AssistantTurnSummary {
	let thinkingCount = 0;
	let toolCount = 0;
	let subagentCount = 0;
	let outputCount = 0;
	let imageCount = 0;
	let lastTextIndex = -1;
	let hasError = false;
	const toolCallIds = new Set<string>();

	for (let index = 0; index < parts.length; index++) {
		const part = parts[index];
		switch (part.type) {
			case "text":
				lastTextIndex = index;
				break;
			case "thinking":
				thinkingCount++;
				break;
			case "tool_call": {
				const id = (part as { id?: string }).id;
				if (id && toolCallIds.has(id)) break;
				if (id) toolCallIds.add(id);
				if (part.name === SUBAGENT_TOOL_NAME) subagentCount++;
				else toolCount++;
				break;
			}
			case "tool_result": {
				// Orphaned results (no preceding call) still represent a tool.
				const id = (part as { id?: string }).id;
				if (id && !toolCallIds.has(id)) {
					toolCallIds.add(id);
					if (part.name === SUBAGENT_TOOL_NAME) subagentCount++;
					else toolCount++;
				}
				if (part.isError) hasError = true;
				break;
			}
			case "image":
				imageCount++;
				break;
			default:
				if (part.type === "file") imageCount++;
				break;
		}
	}

	// Every non-final text part is intermediate narration ("output").
	if (lastTextIndex >= 0) {
		for (let index = 0; index < lastTextIndex; index++) {
			if (parts[index].type === "text") outputCount++;
		}
	}

	const status: TurnStatus = options.isStreaming
		? "in_progress"
		: hasError || options.errored
			? "error"
			: "complete";

	return {
		thinkingCount,
		toolCount,
		subagentCount,
		outputCount,
		imageCount,
		status,
		lastTextIndex,
		hasSteps:
			toolCount > 0 ||
			subagentCount > 0 ||
			thinkingCount > 0 ||
			outputCount > 0,
	};
}

function pluralize(count: number, token: string): string {
	return `${count} ${token}${count === 1 ? "" : "s"}`;
}

/**
 * Human-readable one-line summary, e.g. "2 reasonings · 3 tools · 1 message".
 * Returns an empty string when there is nothing notable to summarize.
 */
export function formatTurnSummary(summary: AssistantTurnSummary): string {
	const parts: string[] = [];
	if (summary.thinkingCount > 0) {
		parts.push(pluralize(summary.thinkingCount, TOKEN_THINKING));
	}
	if (summary.toolCount > 0) {
		parts.push(pluralize(summary.toolCount, TOKEN_TOOL));
	}
	if (summary.subagentCount > 0) {
		parts.push(pluralize(summary.subagentCount, TOKEN_SUBAGENT));
	}
	// Intermediate messages + a trailing answer collapsed into the body.
	if (summary.outputCount > 0) {
		parts.push(pluralize(summary.outputCount, TOKEN_MESSAGE));
	}
	return parts.join(" · ");
}
