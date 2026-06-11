import { classifyAgentToolName } from "@superset/chat/shared";
import type { ToolPart } from "renderer/components/Chat/ChatInterface/utils/tool-helpers";
import type { AgentTimelinePart } from "../../components/AgentTimelinePart";

type ToolLikeTimelinePart = Extract<
	AgentTimelinePart,
	{ type: "tool_progress" | "subagent_event" }
>;

export type AgentTimelineDisplayModel =
	| {
			type: "inline_tool";
			toolPart: ToolPart;
	  }
	| {
			type: "native_timeline";
			part: AgentTimelinePart;
	  };

function firstText(...values: Array<string | undefined>): string {
	return values.map((value) => value?.trim()).find(Boolean) ?? "";
}

function statusToToolState(part: ToolLikeTimelinePart): ToolPart["state"] {
	if (part.type === "tool_progress") {
		if (part.status === "failed" || part.status === "cancelled") {
			return "output-error";
		}
		if (part.status === "completed") {
			return "output-available";
		}
		return "input-streaming";
	}

	if (part.status === "failed" || part.status === "stopped") {
		return "output-error";
	}
	if (part.status === "completed") {
		return "output-available";
	}
	return "input-streaming";
}

function toolNameFromTimelinePart(part: ToolLikeTimelinePart): string {
	if (part.type === "tool_progress") return part.toolName;
	return firstText(part.subagentType);
}

function summaryFromTimelinePart(part: ToolLikeTimelinePart): string {
	if (part.type === "tool_progress")
		return firstText(part.summary, part.toolName);
	return firstText(part.description, part.summary, part.subagentType);
}

function buildInputForKind(
	part: ToolLikeTimelinePart,
): Record<string, unknown> {
	const rawToolName = toolNameFromTimelinePart(part);
	const classification = classifyAgentToolName(rawToolName);
	const summary = summaryFromTimelinePart(part);
	if (classification.kind === "shell") {
		return { command: summary || rawToolName || "Run shell command" };
	}
	if (
		classification.kind === "read" ||
		classification.kind === "write" ||
		classification.kind === "edit"
	) {
		return { path: summary };
	}
	if (classification.kind === "search") {
		return { query: summary };
	}
	if (classification.kind === "fetch") {
		return classification.canonicalName === "web_search"
			? { query: summary }
			: { url: summary };
	}
	if (classification.kind === "subagent") {
		return { prompt: summary };
	}
	if (classification.kind === "skill") {
		return { skill: summary };
	}
	return { description: summary };
}

function buildOutput(part: ToolLikeTimelinePart): Record<string, unknown> {
	if (part.type === "tool_progress") {
		return {
			...(part.summary ? { summary: part.summary, content: part.summary } : {}),
			...(part.elapsedTimeSeconds !== undefined
				? { elapsedTimeSeconds: part.elapsedTimeSeconds }
				: {}),
			...(part.taskId ? { taskId: part.taskId } : {}),
		};
	}
	return {
		...(part.summary ? { summary: part.summary, content: part.summary } : {}),
		...(part.description ? { description: part.description } : {}),
		...(part.lastToolName ? { lastToolName: part.lastToolName } : {}),
		...(part.usage ? { usage: part.usage } : {}),
	};
}

function toInlineToolPart(part: ToolLikeTimelinePart): ToolPart | null {
	const rawToolName = toolNameFromTimelinePart(part);
	if (!rawToolName) return null;
	const classification = classifyAgentToolName(rawToolName);
	if (!classification.isKnownDisplayTool) return null;

	const state = statusToToolState(part);
	return {
		type: `tool-${rawToolName}`,
		toolCallId:
			part.type === "tool_progress"
				? part.toolCallId
				: part.toolCallId || part.taskId || part.id,
		state,
		input: buildInputForKind(part),
		output: buildOutput(part),
		...(state === "output-error"
			? { errorText: summaryFromTimelinePart(part) || "Tool event failed." }
			: {}),
	} as ToolPart;
}

export function buildAgentTimelineDisplayModel(
	part: AgentTimelinePart,
): AgentTimelineDisplayModel {
	if (part.type === "tool_progress" || part.type === "subagent_event") {
		const toolPart = toInlineToolPart(part);
		if (toolPart) {
			return {
				type: "inline_tool",
				toolPart,
			};
		}
	}

	return {
		type: "native_timeline",
		part,
	};
}
