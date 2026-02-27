import type { UseMastraChatDisplayReturn } from "@superset/chat-mastra/client";
import {
	Conversation,
	ConversationContent,
	ConversationEmptyState,
	ConversationScrollButton,
} from "@superset/ui/ai-elements/conversation";
import { Message, MessageContent } from "@superset/ui/ai-elements/message";
import { ShimmerLabel } from "@superset/ui/ai-elements/shimmer-label";
import { useMemo } from "react";
import { HiMiniChatBubbleLeftRight } from "react-icons/hi2";
import { MastraToolCallBlock } from "../../../../ChatPane/ChatInterface/components/MastraToolCallBlock";
import type { ToolPart } from "../../../../ChatPane/ChatInterface/utils/tool-helpers";
import { normalizeToolName } from "../../../../ChatPane/ChatInterface/utils/tool-helpers";
import { AssistantMessage } from "./components/AssistantMessage";
import { MessageScrollbackRail } from "./components/MessageScrollbackRail";
import { UserMessage } from "./components/UserMessage";

type MastraMessage = NonNullable<
	UseMastraChatDisplayReturn["messages"]
>[number];
type MastraActiveTools = NonNullable<UseMastraChatDisplayReturn["activeTools"]>;
type MastraToolInputBuffers = NonNullable<
	UseMastraChatDisplayReturn["toolInputBuffers"]
>;
type MastraActiveTool =
	MastraActiveTools extends Map<string, infer ToolState> ? ToolState : never;
type MastraToolInputBuffer =
	MastraToolInputBuffers extends Map<string, infer InputBuffer>
		? InputBuffer
		: never;

function asRecord(value: unknown): Record<string, unknown> | null {
	if (typeof value === "object" && value !== null) {
		return value as Record<string, unknown>;
	}
	return null;
}

interface ChatMastraMessageListProps {
	messages: MastraMessage[];
	isRunning: boolean;
	currentMessage: MastraMessage | null;
	workspaceId: string;
	workspaceCwd?: string;
	activeTools: MastraActiveTools | undefined;
	toolInputBuffers: MastraToolInputBuffers | undefined;
}

function toPreviewToolPart({
	toolCallId,
	toolState,
	inputBuffer,
}: {
	toolCallId: string;
	toolState: MastraActiveTool | null;
	inputBuffer: MastraToolInputBuffer | null;
}): ToolPart {
	const toolStateRecord = asRecord(toolState);
	const inputBufferRecord = asRecord(inputBuffer);
	const name =
		(typeof toolStateRecord?.name === "string"
			? toolStateRecord.name
			: undefined) ??
		(typeof inputBufferRecord?.toolName === "string"
			? inputBufferRecord.toolName
			: undefined) ??
		"unknown_tool";
	const status =
		typeof toolStateRecord?.status === "string"
			? toolStateRecord.status
			: "streaming_input";
	const isError =
		typeof toolStateRecord?.isError === "boolean" && toolStateRecord.isError;
	const state: ToolPart["state"] =
		status === "error" || isError
			? "output-error"
			: status === "completed"
				? "output-available"
				: status === "streaming_input"
					? "input-streaming"
					: "input-available";
	const input = toolStateRecord?.args ?? inputBufferRecord?.text ?? {};
	const output = toolStateRecord?.result ?? toolStateRecord?.partialResult;

	return {
		type: `tool-${normalizeToolName(name)}` as ToolPart["type"],
		toolCallId,
		state,
		input,
		...(state === "output-available" || state === "output-error"
			? { output }
			: {}),
	} as ToolPart;
}

function toToolEntries<T>(
	value: Map<string, T> | undefined,
): Array<[string, T]> {
	if (!value) return [];
	return [...value.entries()];
}

function findLastUserMessageIndex(messages: MastraMessage[]): number {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		if (messages[index]?.role === "user") return index;
	}
	return -1;
}

function getStreamingPreviewToolParts({
	activeTools,
	toolInputBuffers,
}: {
	activeTools: MastraActiveTools | undefined;
	toolInputBuffers: MastraToolInputBuffers | undefined;
}): ToolPart[] {
	const activeEntries = toToolEntries(activeTools);
	const inputEntries = toToolEntries(toolInputBuffers);
	const knownIds = new Set<string>([
		...activeEntries.map(([id]) => id),
		...inputEntries.map(([id]) => id),
	]);

	return [...knownIds].map((toolCallId) => {
		const toolState =
			activeEntries.find(([id]) => id === toolCallId)?.[1] ?? null;
		const inputBuffer =
			inputEntries.find(([id]) => id === toolCallId)?.[1] ?? null;
		return toPreviewToolPart({ toolCallId, toolState, inputBuffer });
	});
}

export function ChatMastraMessageList({
	messages,
	isRunning,
	currentMessage,
	workspaceId,
	workspaceCwd,
	activeTools,
	toolInputBuffers,
}: ChatMastraMessageListProps) {
	const visibleMessages = useMemo(() => {
		if (!isRunning || !currentMessage || currentMessage.role !== "assistant") {
			return messages;
		}
		const turnStartIndex = findLastUserMessageIndex(messages) + 1;
		const previousTurns = messages.slice(0, turnStartIndex);
		const activeTurnNonAssistant = messages
			.slice(turnStartIndex)
			.filter((message) => message.role !== "assistant");
		return [...previousTurns, ...activeTurnNonAssistant];
	}, [messages, isRunning, currentMessage]);

	const previewToolParts = useMemo(
		() =>
			getStreamingPreviewToolParts({
				activeTools,
				toolInputBuffers,
			}),
		[activeTools, toolInputBuffers],
	);

	return (
		<Conversation className="flex-1">
			<ConversationContent className="mx-auto w-full max-w-3xl gap-6 py-6 pl-6 pr-16">
				{visibleMessages.length === 0 ? (
					<ConversationEmptyState
						title="Start a conversation"
						description="Ask anything to get started"
						icon={<HiMiniChatBubbleLeftRight className="size-8" />}
					/>
				) : (
					visibleMessages.map((message) => {
						if (message.role === "user")
							return (
								<UserMessage
									key={message.id}
									message={message}
									workspaceId={workspaceId}
									workspaceCwd={workspaceCwd}
								/>
							);

						return (
							<AssistantMessage
								key={message.id}
								message={message}
								workspaceId={workspaceId}
								workspaceCwd={workspaceCwd}
								isStreaming={false}
								previewToolParts={[]}
							/>
						);
					})
				)}
				{isRunning && currentMessage && (
					<AssistantMessage
						key={`current-${currentMessage.id}`}
						message={currentMessage}
						workspaceId={workspaceId}
						workspaceCwd={workspaceCwd}
						isStreaming
						previewToolParts={previewToolParts}
					/>
				)}
				{isRunning &&
					!currentMessage &&
					visibleMessages[visibleMessages.length - 1]?.role === "user" &&
					previewToolParts.length === 0 && (
						<Message from="assistant">
							<MessageContent>
								<ShimmerLabel className="text-sm text-muted-foreground">
									Thinking...
								</ShimmerLabel>
							</MessageContent>
						</Message>
					)}
				{isRunning &&
					!currentMessage &&
					visibleMessages[visibleMessages.length - 1]?.role === "user" &&
					previewToolParts.length > 0 && (
						<Message from="assistant">
							<MessageContent>
								{previewToolParts.map((part) => (
									<MastraToolCallBlock
										key={`tool-preview-${part.toolCallId}`}
										part={part}
										workspaceId={workspaceId}
										workspaceCwd={workspaceCwd}
									/>
								))}
							</MessageContent>
						</Message>
					)}
			</ConversationContent>
			<MessageScrollbackRail messages={visibleMessages} />
			<ConversationScrollButton />
		</Conversation>
	);
}
