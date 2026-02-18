import type { ExploringGroupItem } from "@superset/ui/ai-elements/exploring-group";
import { ExploringGroup } from "@superset/ui/ai-elements/exploring-group";
import {
	Message,
	MessageAction,
	MessageActions,
	MessageContent,
	MessageResponse,
} from "@superset/ui/ai-elements/message";
import {
	Reasoning,
	ReasoningContent,
	ReasoningTrigger,
} from "@superset/ui/ai-elements/reasoning";
import type {
	MessagePart,
	ToolCallPart,
	ToolResultPart,
	UIMessage,
} from "@tanstack/ai";
import { HiMiniArrowPath, HiMiniClipboard } from "react-icons/hi2";
import { safeParseJson } from "../../utils/map-tool-state";
import { getToolMeta, getToolStatus } from "../../utils/tool-registry";
import { ToolCallBlock } from "../ToolCallBlock";

interface ChatMessageItemProps {
	message: UIMessage;
	isStreaming?: boolean;
	onApprove?: (approvalId: string) => void;
	onDeny?: (approvalId: string) => void;
	onAnswer?: (toolUseId: string, answers: Record<string, string>) => void;
}

const EXPLORING_TOOLS = new Set(["Read", "Grep", "Glob"]);
const MIN_GROUP_SIZE = 3;

function getPartKey(part: MessagePart, index: number): string {
	switch (part.type) {
		case "tool-call":
			return part.id;
		case "tool-result":
			return `result-${part.toolCallId}`;
		default:
			return `${part.type}-${index}`;
	}
}

type RenderedItem =
	| { kind: "part"; part: MessagePart; index: number }
	| {
			kind: "exploring-group";
			items: Array<{ part: ToolCallPart; index: number }>;
	  };

function groupParts(parts: MessagePart[]): RenderedItem[] {
	const result: RenderedItem[] = [];
	let i = 0;

	while (i < parts.length) {
		const part = parts[i];

		if (part.type === "tool-call" && EXPLORING_TOOLS.has(part.name)) {
			const run: Array<{ part: ToolCallPart; index: number }> = [];
			while (i < parts.length) {
				const current = parts[i];
				if (current.type === "tool-call" && EXPLORING_TOOLS.has(current.name)) {
					run.push({ part: current as ToolCallPart, index: i });
					i++;
				} else if (current.type === "tool-result") {
					i++;
				} else {
					break;
				}
			}

			if (run.length >= MIN_GROUP_SIZE) {
				result.push({ kind: "exploring-group", items: run });
			} else {
				for (const item of run) {
					result.push({ kind: "part", part: item.part, index: item.index });
				}
			}
		} else {
			result.push({ kind: "part", part, index: i });
			i++;
		}
	}

	return result;
}

function buildGroupItem({
	tc,
	toolResult,
}: {
	tc: ToolCallPart;
	toolResult?: ToolResultPart;
}): ExploringGroupItem {
	const meta = getToolMeta(tc.name);
	const args = safeParseJson(tc.arguments);
	const resultContent = toolResult?.content
		? safeParseJson(toolResult.content)
		: {};
	const state = toolResult
		? toolResult.error
			? "output-error"
			: "output-available"
		: (tc.state ?? "input-available");
	const { isPending, isError } = getToolStatus(
		state,
		Boolean(toolResult),
		Boolean(toolResult?.error),
	);

	return {
		icon: meta.icon,
		title: meta.title(args, resultContent, state),
		subtitle: meta.subtitle?.(args, resultContent, state),
		isPending,
		isError,
	};
}

export function ChatMessageItem({
	message,
	isStreaming,
	onApprove,
	onDeny,
	onAnswer,
}: ChatMessageItemProps) {
	const toolResults = new Map<string, ToolResultPart>();
	for (const part of message.parts) {
		if (part.type === "tool-result") {
			toolResults.set(part.toolCallId, part as ToolResultPart);
		}
	}

	const hasTextContent = message.parts.some(
		(p) => p.type === "text" && p.content,
	);

	const grouped = groupParts(message.parts);

	if (message.role === "user") {
		const textContent = message.parts
			.filter((p) => p.type === "text" && p.content)
			.map((p) => (p as { content: string }).content)
			.join("\n");

		return (
			<Message from="user">
				<MessageContent>
					{textContent && (
						<div className="relative max-h-[100px] overflow-hidden rounded-xl border bg-input px-3 py-2 text-sm whitespace-pre-wrap">
							{textContent}
						</div>
					)}
				</MessageContent>
			</Message>
		);
	}

	return (
		<Message from={message.role}>
			<MessageContent>
				{grouped.map((item) => {
					if (item.kind === "exploring-group") {
						const groupKey = item.items.map((i) => i.part.id).join("-");
						const isStreaming = item.items.some(
							(i) =>
								!toolResults.has(i.part.id) &&
								(i.part.state === "input-streaming" ||
									i.part.state === "awaiting-input"),
						);
						const groupItems = item.items.map((i) =>
							buildGroupItem({
								tc: i.part,
								toolResult: toolResults.get(i.part.id),
							}),
						);
						return (
							<ExploringGroup
								isStreaming={isStreaming}
								items={groupItems}
								key={groupKey}
							/>
						);
					}

					const { part, index } = item;
					const key = getPartKey(part, index);

					switch (part.type) {
						case "thinking":
							return (
								<Reasoning key={key}>
									<ReasoningTrigger />
									<ReasoningContent>{part.content}</ReasoningContent>
								</Reasoning>
							);
						case "text":
							return part.content ? (
								<MessageResponse key={key} isAnimating={isStreaming}>
									{part.content}
								</MessageResponse>
							) : null;
						case "tool-call": {
							const tc = part as ToolCallPart;
							return (
								<ToolCallBlock
									key={key}
									toolCallPart={tc}
									toolResultPart={toolResults.get(tc.id)}
									onApprove={onApprove}
									onDeny={onDeny}
									onAnswer={onAnswer}
								/>
							);
						}
						case "tool-result":
							return null;
						default:
							return null;
					}
				})}
			</MessageContent>
			{hasTextContent && (
				<MessageActions>
					<MessageAction tooltip="Copy">
						<HiMiniClipboard className="size-3.5" />
					</MessageAction>
					<MessageAction tooltip="Retry">
						<HiMiniArrowPath className="size-3.5" />
					</MessageAction>
				</MessageActions>
			)}
		</Message>
	);
}
