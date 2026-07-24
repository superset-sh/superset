import type { UseChatDisplayReturn } from "@superset/chat/client";
import { Message, MessageContent } from "@superset/ui/ai-elements/message";
import { ShimmerLabel } from "@superset/ui/ai-elements/shimmer-label";
import { FileSearchIcon } from "lucide-react";
import { type ReactNode, useCallback, useMemo } from "react";
import { AssistantTurnGroup } from "renderer/components/Chat/ChatInterface/components/AssistantTurnGroup";
import { StreamingMessageText } from "renderer/components/Chat/ChatInterface/components/MessagePartsRenderer/components/StreamingMessageText";
import { ToolCallBlock } from "renderer/components/Chat/ChatInterface/components/ToolCallBlock";
import { TurnTextItem } from "renderer/components/Chat/ChatInterface/components/TurnTextItem";
import {
	formatTurnSummary,
	summarizeAssistantTurn,
} from "renderer/components/Chat/ChatInterface/utils/group-assistant-turn";
import type { ToolPart } from "renderer/components/Chat/ChatInterface/utils/tool-helpers";
import { normalizeToolName } from "renderer/components/Chat/ChatInterface/utils/tool-helpers";
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
	isInterrupted?: boolean;
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
	isInterrupted,
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
	// Turn-level grouping ("agent inspector" flavor): intermediate actions
	// collapse into a single group while the final answer stays visible.
	const messageMeta = message as {
		stopReason?: string;
		errorMessage?: string;
		createdAt?: string | number | Date;
	};
	const errored =
		messageMeta.stopReason === "error" ||
		Boolean(messageMeta.errorMessage?.trim());
	const turnSummary = useMemo(
		() => summarizeAssistantTurn(message.content, { isStreaming, errored }),
		[message.content, isStreaming, errored],
	);
	const stepNodes: ReactNode[] = [];
	const lastOutputNodes: ReactNode[] = [];
	// Required actions (e.g. plan approval) render OUTSIDE the collapsible group so
	// collapsing a turn can never hide an action the user must take.
	const pendingActionNodes: ReactNode[] = [];
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
			// The final text part is the turn's answer — surfaced outside the
			// collapsible group so it stays visible even when steps collapse.
			if (partIndex === turnSummary.lastTextIndex) {
				lastOutputNodes.push(
					<StreamingMessageText
						key={`${message.id}-${partIndex}`}
						text={part.text}
						isAnimating={isStreaming}
						mermaid={{ config: { theme: "default" } }}
					/>,
				);
			} else {
				// Intermediate narration → collapsible "Output" item row.
				stepNodes.push(
					<TurnTextItem
						key={`${message.id}-${partIndex}`}
						kind="output"
						text={part.text}
						isStreaming={isStreaming}
					/>,
				);
			}
			continue;
		}

		if (part.type === "thinking") {
			stepNodes.push(
				<TurnTextItem
					key={`${message.id}-${partIndex}`}
					kind="thinking"
					text={part.thinking}
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
				stepNodes.push(
					<div key={`${message.id}-${partIndex}`} className="max-w-[85%]">
						<ImagePart data={part.data} mimeType={part.mimeType} />
					</div>,
				);
				continue;
			}

			if (mediaType.startsWith("image/")) {
				stepNodes.push(
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
				stepNodes.push(
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

			stepNodes.push(
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
					isStreaming={isStreaming}
					isInterrupted={isInterrupted}
				/>,
			);
			pendingActionNodes.push(...getInlineToolStateNodes(part.id));

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
			stepNodes.push(
				<ToolCallBlock
					key={`${message.id}-tool-result-${part.id}`}
					part={toToolPartFromResult(part)}
					workspaceId={workspaceId}
					sessionId={sessionId}
					organizationId={organizationId}
					workspaceCwd={workspaceCwd}
					isStreaming={isStreaming}
					isInterrupted={isInterrupted}
				/>,
			);
			pendingActionNodes.push(...getInlineToolStateNodes(part.id));
			continue;
		}

		if (part.type.startsWith("om_")) {
			stepNodes.push(
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
		stepNodes.push(
			<ToolCallBlock
				key={`${message.id}-tool-preview-${previewPart.toolCallId}`}
				part={previewPart}
				workspaceId={workspaceId}
				sessionId={sessionId}
				organizationId={organizationId}
				workspaceCwd={workspaceCwd}
				isStreaming={isStreaming}
			/>,
		);
		pendingActionNodes.push(...getInlineToolStateNodes(previewPart.toolCallId));
	}

	const hasPendingAction = pendingActionNodes.length > 0;
	const hasAnyNode =
		stepNodes.length > 0 || lastOutputNodes.length > 0 || hasPendingAction;

	if (!hasAnyNode && !isStreaming && !footer) {
		return null;
	}

	let body: ReactNode;
	if (!hasAnyNode && isStreaming) {
		body = (
			<ShimmerLabel className="text-sm text-muted-foreground">
				Thinking...
			</ShimmerLabel>
		);
	} else if (turnSummary.hasSteps) {
		// Keep the live turn (or one needing attention) open; collapse a finished
		// turn down to its summary + answer.
		const defaultOpen =
			isStreaming ||
			turnSummary.status === "error" ||
			hasPendingAction ||
			lastOutputNodes.length === 0;
		body = (
			<AssistantTurnGroup
				summary={formatTurnSummary(turnSummary)}
				status={turnSummary.status}
				pendingAction={hasPendingAction}
				timestamp={messageMeta.createdAt}
				defaultOpen={defaultOpen}
				steps={stepNodes}
				lastOutput={lastOutputNodes.length > 0 ? lastOutputNodes : null}
			/>
		);
	} else {
		// No tool/thinking work — render the plain answer (simple Q&A stays clean).
		body = (
			<>
				{stepNodes}
				{lastOutputNodes}
			</>
		);
	}

	return (
		<Message from="assistant">
			<MessageContent>
				{/* Pending actions sit outside `body` so they stay visible even when
				    the turn group is collapsed. */}
				{body}
				{pendingActionNodes}
				{footer}
			</MessageContent>
		</Message>
	);
}
