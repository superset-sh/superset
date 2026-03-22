import { Message, MessageContent } from "@superset/ui/ai-elements/message";
import { ShimmerLabel } from "@superset/ui/ai-elements/shimmer-label";
import { FileSearchIcon } from "lucide-react";
import { type ReactNode, useCallback } from "react";
import { StreamingMessageText } from "renderer/components/Chat/ChatInterface/components/MessagePartsRenderer/components/StreamingMessageText";
import { ReasoningBlock } from "renderer/components/Chat/ChatInterface/components/ReasoningBlock";
import { ToolCallBlock } from "renderer/components/Chat/ChatInterface/components/ToolCallBlock";
import type { ToolPart } from "renderer/components/Chat/ChatInterface/utils/tool-helpers";
import { normalizeToolName } from "renderer/components/Chat/ChatInterface/utils/tool-helpers";
import type { UseChatDisplayReturn } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/WorkspaceChat/hooks/useWorkspaceChatDisplay";
import { useTabsStore } from "renderer/stores/tabs/store";
import { AttachmentChip } from "../AttachmentChip";
import { PendingPlanApprovalMessage } from "../PendingPlanApprovalMessage";

type ChatMessage = NonNullable<UseChatDisplayReturn["messages"]>[number];
type ChatMessageContent = ChatMessage["content"][number];
type ChatToolCall = Extract<ChatMessageContent, { type: "tool_call" }>;
type ChatToolResult = Extract<ChatMessageContent, { type: "tool_result" }>;
type ChatPendingPlanApproval = UseChatDisplayReturn["pendingPlanApproval"];

interface AssistantMessageProps {
	message: ChatMessage;
	isStreaming: boolean;
	workspaceId: string;
	sessionId?: string | null;
	organizationId?: string | null;
	workspaceCwd?: string;
	previewToolParts?: ToolPart[];
	footer?: ReactNode;
	pendingPlanApproval?: ChatPendingPlanApproval;
	pendingPlanToolCallId?: string | null;
	isPlanSubmitting?: boolean;
	onPlanRespond?: (response: {
		action: "approved" | "rejected";
		feedback?: string;
	}) => Promise<void>;
}

function ImagePart({ data, mimeType }: { data: string; mimeType: string }) {
	return (
		<img
			src={`data:${mimeType};base64,${data}`}
			alt="Attached"
			className="max-h-48 rounded-lg object-contain"
		/>
	);
}

function findToolResultForCall({
	content,
	toolCallId,
	startAt,
}: {
	content: ChatMessage["content"];
	toolCallId: string;
	startAt: number;
}): { result: ChatToolResult | null; index: number } {
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
	part: ChatToolCall;
	result: ChatToolResult | null;
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

function toToolPartFromResult(part: ChatToolResult): ToolPart {
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
	pendingPlanApproval,
	pendingPlanToolCallId = null,
	isPlanSubmitting = false,
	onPlanRespond,
}: AssistantMessageProps) {
	const addFileViewerPane = useTabsStore((store) => store.addFileViewerPane);
	const nodes: ReactNode[] = [];
	const renderedToolCallIds = new Set<string>();
	let didRenderPendingPlanApproval = false;
	const handleAttachmentClick = useCallback(
		(url: string, filename?: string) => {
			addFileViewerPane(workspaceId, {
				filePath: url,
				isPinned: true,
				...(filename ? { displayName: filename } : {}),
			});
		},
		[addFileViewerPane, workspaceId],
	);
	const getInlineToolStateNodes = (toolCallId: string): ReactNode[] => {
		const inlineNodes: ReactNode[] = [];

		if (
			!didRenderPendingPlanApproval &&
			pendingPlanApproval &&
			pendingPlanToolCallId &&
			pendingPlanToolCallId === toolCallId &&
			onPlanRespond
		) {
			didRenderPendingPlanApproval = true;
			inlineNodes.push(
				<PendingPlanApprovalMessage
					key={`${message.id}-pending-plan-${toolCallId}`}
					planApproval={pendingPlanApproval}
					isSubmitting={isPlanSubmitting}
					onRespond={onPlanRespond}
					inline
				/>,
			);
		}

		return inlineNodes;
	};
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

		const rawPart = part as {
			data?: string;
			filename?: string;
			image?: string;
			mediaType?: string;
			mimeType?: string;
			type?: string;
		};
		if (part.type === "image" || rawPart.type === "file") {
			const mediaType =
				rawPart.mediaType ?? rawPart.mimeType ?? "application/octet-stream";
			const data = rawPart.data ?? rawPart.image ?? "";
			if (!data) {
				continue;
			}

			if (part.type === "image" && "mimeType" in part && !rawPart.mediaType) {
				nodes.push(
					<div key={`${message.id}-${partIndex}`} className="max-w-[85%]">
						<ImagePart data={part.data} mimeType={part.mimeType} />
					</div>,
				);
				continue;
			}

			if (mediaType.startsWith("image/")) {
				nodes.push(
					<button
						type="button"
						key={`${message.id}-${partIndex}`}
						className="max-w-[85%] cursor-pointer"
						aria-label={
							rawPart.filename
								? `View ${rawPart.filename}`
								: "View generated image"
						}
						onClick={() => handleAttachmentClick(data, rawPart.filename)}
					>
						<img
							src={data}
							alt={rawPart.filename ?? "Generated"}
							className="max-h-48 rounded-lg object-contain"
						/>
					</button>,
				);
			} else {
				nodes.push(
					<AttachmentChip
						key={`${message.id}-${partIndex}`}
						data={data}
						filename={rawPart.filename}
						mediaType={mediaType}
						onClick={() => handleAttachmentClick(data, rawPart.filename)}
					/>,
				);
			}
			continue;
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
				<ToolCallBlock
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
			nodes.push(...getInlineToolStateNodes(part.id));

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
				<ToolCallBlock
					key={`${message.id}-tool-result-${part.id}`}
					part={toToolPartFromResult(part)}
					workspaceId={workspaceId}
					sessionId={sessionId}
					organizationId={organizationId}
					workspaceCwd={workspaceCwd}
				/>,
			);
			nodes.push(...getInlineToolStateNodes(part.id));
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
			<ToolCallBlock
				key={`${message.id}-tool-preview-${previewPart.toolCallId}`}
				part={previewPart}
				workspaceId={workspaceId}
				sessionId={sessionId}
				organizationId={organizationId}
				workspaceCwd={workspaceCwd}
			/>,
		);
		nodes.push(...getInlineToolStateNodes(previewPart.toolCallId));
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
