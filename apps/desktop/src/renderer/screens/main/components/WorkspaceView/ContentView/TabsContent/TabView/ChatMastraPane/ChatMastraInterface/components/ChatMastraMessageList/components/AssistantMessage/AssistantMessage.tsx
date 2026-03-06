import type { UseMastraChatDisplayReturn } from "@superset/chat-mastra/client";
import { Message, MessageContent } from "@superset/ui/ai-elements/message";
import { ShimmerLabel } from "@superset/ui/ai-elements/shimmer-label";
import { FileSearchIcon } from "lucide-react";
import { type ReactNode, useCallback } from "react";
import { useTabsStore } from "renderer/stores/tabs/store";
import { MastraToolCallBlock } from "../../../../../../ChatPane/ChatInterface/components/MastraToolCallBlock";
import { StreamingMessageText } from "../../../../../../ChatPane/ChatInterface/components/MessagePartsRenderer/components/StreamingMessageText";
import { ReasoningBlock } from "../../../../../../ChatPane/ChatInterface/components/ReasoningBlock";
import type { ToolPart } from "../../../../../../ChatPane/ChatInterface/utils/tool-helpers";
import { normalizeToolName } from "../../../../../../ChatPane/ChatInterface/utils/tool-helpers";
import { AttachmentChip } from "../AttachmentChip";

type MastraMessage = NonNullable<
	UseMastraChatDisplayReturn["messages"]
>[number];
type MastraMessageContent = MastraMessage["content"][number];
type MastraToolCall = Extract<MastraMessageContent, { type: "tool_call" }>;
type MastraToolResult = Extract<MastraMessageContent, { type: "tool_result" }>;

interface AssistantMessageProps {
	message: MastraMessage;
	isStreaming: boolean;
	workspaceId: string;
	sessionId?: string | null;
	organizationId?: string | null;
	workspaceCwd?: string;
	previewToolParts?: ToolPart[];
	footer?: ReactNode;
}

function findToolResultForCall({
	content,
	toolCallId,
	startAt,
}: {
	content: MastraMessage["content"];
	toolCallId: string;
	startAt: number;
}): { result: MastraToolResult | null; index: number } {
	for (let index = startAt; index < content.length; index++) {
		const part = content[index];
		if (part.type === "tool_result" && part.id === toolCallId) {
			return { result: part, index };
		}
	}
	return { result: null, index: -1 };
}

function toToolPartFromCall({
	part,
	result,
	isStreaming,
}: {
	part: MastraToolCall;
	result: MastraToolResult | null;
	isStreaming: boolean;
}): ToolPart {
	return {
		type: `tool-${normalizeToolName(part.name)}` as ToolPart["type"],
		toolCallId: part.id,
		state: result?.isError
			? "output-error"
			: result
				? "output-available"
				: isStreaming
					? "input-streaming"
					: "input-available",
		input: part.args,
		...(result ? { output: result.result } : {}),
	} as ToolPart;
}

function toToolPartFromResult(part: MastraToolResult): ToolPart {
	return {
		type: `tool-${normalizeToolName(part.name)}` as ToolPart["type"],
		toolCallId: part.id,
		state: part.isError ? "output-error" : "output-available",
		input: {},
		output: part.result,
	} as ToolPart;
}

export function AssistantMessage({
	message,
	isStreaming,
	workspaceId,
	sessionId,
	organizationId,
	workspaceCwd,
	previewToolParts = [],
	footer,
}: AssistantMessageProps) {
	const addFileViewerPane = useTabsStore((store) => store.addFileViewerPane);
	const handleAttachmentClick = useCallback(
		(url: string, filename?: string) => {
			if (!workspaceId) return;
			addFileViewerPane(workspaceId, {
				filePath: url,
				isPinned: true,
				...(filename ? { displayName: filename } : {}),
			});
		},
		[workspaceId, addFileViewerPane],
	);
	const nodes: ReactNode[] = [];
	const renderedToolCallIds = new Set<string>();
	for (let partIndex = 0; partIndex < message.content.length; partIndex++) {
		const part = message.content[partIndex];

		if (part.type === "text") {
			nodes.push(
				<StreamingMessageText
					key={`${message.id}-${partIndex}`}
					text={part.text}
					isAnimating={isStreaming}
					mermaid={{
						config: {
							theme: "default",
						},
					}}
				/>,
			);
			continue;
		}

		if (part.type === "thinking") {
			nodes.push(
				<ReasoningBlock
					key={`${message.id}-${partIndex}`}
					reasoning={part.thinking}
				/>,
			);
			continue;
		}

		{
			const rawPart = part as Record<string, unknown>;
			if (rawPart.type === "file" || rawPart.type === "image") {
				const mime =
					(rawPart.mediaType as string) ||
					(rawPart.mimeType as string) ||
					"application/octet-stream";
				const data =
					(rawPart.data as string) || (rawPart.image as string) || "";
				if (mime.startsWith("image/") && data) {
					nodes.push(
						<button
							type="button"
							key={`${message.id}-${partIndex}`}
							className="max-w-[85%] cursor-pointer"
							onClick={() =>
								handleAttachmentClick(
									data,
									rawPart.filename as string | undefined,
								)
							}
						>
							<img
								src={data}
								alt="Generated"
								className="max-h-48 rounded-lg object-contain"
							/>
						</button>,
					);
				} else if (data) {
					nodes.push(
						<AttachmentChip
							key={`${message.id}-${partIndex}`}
							data={data}
							filename={rawPart.filename as string | undefined}
							mediaType={mime}
						/>,
					);
				}
				continue;
			}
		}

		if (part.type === "tool_call") {
			if (renderedToolCallIds.has(part.id)) {
				continue;
			}
			renderedToolCallIds.add(part.id);
			const { result, index: resultIndex } = findToolResultForCall({
				content: message.content,
				toolCallId: part.id,
				startAt: partIndex + 1,
			});

			nodes.push(
				<MastraToolCallBlock
					key={`${message.id}-tool-${part.id}`}
					part={toToolPartFromCall({
						part,
						result,
						isStreaming,
					})}
					workspaceId={workspaceId}
					sessionId={sessionId}
					organizationId={organizationId}
					workspaceCwd={workspaceCwd}
				/>,
			);

			if (resultIndex === partIndex + 1) {
				partIndex++;
			}
			continue;
		}

		if (part.type === "tool_result") {
			if (renderedToolCallIds.has(part.id)) {
				continue;
			}
			renderedToolCallIds.add(part.id);
			nodes.push(
				<MastraToolCallBlock
					key={`${message.id}-tool-result-${part.id}`}
					part={toToolPartFromResult(part)}
					workspaceId={workspaceId}
					sessionId={sessionId}
					organizationId={organizationId}
					workspaceCwd={workspaceCwd}
				/>,
			);
			continue;
		}

		if (part.type.startsWith("om_")) {
			nodes.push(
				<div
					key={`${message.id}-${partIndex}`}
					className="flex items-center gap-2 text-xs text-muted-foreground"
				>
					<FileSearchIcon className="size-3.5" />
					<span>{part.type.replaceAll("_", " ")}</span>
				</div>,
			);
		}
	}

	for (const previewPart of previewToolParts) {
		if (renderedToolCallIds.has(previewPart.toolCallId)) continue;
		nodes.push(
			<MastraToolCallBlock
				key={`${message.id}-tool-preview-${previewPart.toolCallId}`}
				part={previewPart}
				workspaceId={workspaceId}
				sessionId={sessionId}
				organizationId={organizationId}
				workspaceCwd={workspaceCwd}
			/>,
		);
	}

	return (
		<Message from="assistant">
			<MessageContent>
				{nodes.length === 0 && isStreaming ? (
					<ShimmerLabel className="text-sm text-muted-foreground">
						Thinking...
					</ShimmerLabel>
				) : (
					nodes
				)}
				{footer}
			</MessageContent>
		</Message>
	);
}
