import type { UseMastraChatDisplayReturn } from "@superset/chat-mastra/client";
import {
	Conversation,
	ConversationContent,
	ConversationEmptyState,
	ConversationScrollButton,
} from "@superset/ui/ai-elements/conversation";
import { Message, MessageContent } from "@superset/ui/ai-elements/message";
import { ShimmerLabel } from "@superset/ui/ai-elements/shimmer-label";
import { FileSearchIcon } from "lucide-react";
import type { ReactNode } from "react";
import { HiMiniChatBubbleLeftRight } from "react-icons/hi2";
import { MastraToolCallBlock } from "../../../../ChatPane/ChatInterface/components/MastraToolCallBlock";
import { StreamingMessageText } from "../../../../ChatPane/ChatInterface/components/MessagePartsRenderer/components/StreamingMessageText";
import { ReasoningBlock } from "../../../../ChatPane/ChatInterface/components/ReasoningBlock";
import type { ToolPart } from "../../../../ChatPane/ChatInterface/utils/tool-helpers";
import { normalizeToolName } from "../../../../ChatPane/ChatInterface/utils/tool-helpers";

type MastraMessage = NonNullable<
	UseMastraChatDisplayReturn["messages"]
>[number];
type MastraMessageContent = MastraMessage["content"][number];
type MastraToolCall = Extract<MastraMessageContent, { type: "tool_call" }>;
type MastraToolResult = Extract<MastraMessageContent, { type: "tool_result" }>;

interface ChatMastraMessageListProps {
	messages: MastraMessage[];
	isRunning: boolean;
	currentMessage: MastraMessage | null;
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

function UserMessage({ message }: { message: MastraMessage }) {
	return (
		<div
			className="flex flex-col items-end gap-2"
			data-chat-user-message="true"
			data-message-id={message.id}
		>
			{message.content.map((part, partIndex) => {
				if (part.type === "text") {
					return (
						<div
							key={`${message.id}-${partIndex}`}
							className="max-w-[85%] rounded-2xl bg-muted px-4 py-2.5 text-sm text-foreground whitespace-pre-wrap"
						>
							{part.text}
						</div>
					);
				}
				if (part.type === "image") {
					return (
						<div key={`${message.id}-${partIndex}`} className="max-w-[85%]">
							<ImagePart data={part.data} mimeType={part.mimeType} />
						</div>
					);
				}
				return null;
			})}
		</div>
	);
}

function AssistantMessage({
	message,
	isStreaming,
}: {
	message: MastraMessage;
	isStreaming: boolean;
}) {
	const nodes: ReactNode[] = [];
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

		if (part.type === "image") {
			nodes.push(
				<div key={`${message.id}-${partIndex}`} className="max-w-[85%]">
					<ImagePart data={part.data} mimeType={part.mimeType} />
				</div>,
			);
			continue;
		}

		if (part.type === "tool_call") {
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
				/>,
			);

			// If next sibling is the matched result, skip it.
			if (resultIndex === partIndex + 1) {
				partIndex++;
			}
			continue;
		}

		if (part.type === "tool_result") {
			nodes.push(
				<MastraToolCallBlock
					key={`${message.id}-tool-result-${part.id}`}
					part={toToolPartFromResult(part)}
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
			</MessageContent>
		</Message>
	);
}

export function ChatMastraMessageList({
	messages,
	isRunning,
	currentMessage,
}: ChatMastraMessageListProps) {
	return (
		<Conversation className="flex-1">
			<ConversationContent className="mx-auto w-full max-w-3xl gap-6 py-6 px-6">
				{messages.length === 0 ? (
					<ConversationEmptyState
						title="Start a conversation"
						description="Ask anything to get started"
						icon={<HiMiniChatBubbleLeftRight className="size-8" />}
					/>
				) : (
					messages.map((message) => {
						if (message.role === "user")
							return <UserMessage key={message.id} message={message} />;

						return (
							<AssistantMessage
								key={message.id}
								message={message}
								isStreaming={isRunning && message.id === currentMessage?.id}
							/>
						);
					})
				)}
				{isRunning &&
					!currentMessage &&
					messages[messages.length - 1]?.role === "user" && (
						<Message from="assistant">
							<MessageContent>
								<ShimmerLabel className="text-sm text-muted-foreground">
									Thinking...
								</ShimmerLabel>
							</MessageContent>
						</Message>
					)}
			</ConversationContent>
			<ConversationScrollButton />
		</Conversation>
	);
}
