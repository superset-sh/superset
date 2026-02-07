import type {
	MessagePart,
	ToolCallPart,
	ToolResultPart,
	UIMessage,
} from "@superset/durable-session/react";
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
import { HiMiniArrowPath, HiMiniClipboard } from "react-icons/hi2";
import { ToolCallBlock } from "../ToolCallBlock";

interface ChatMessageItemProps {
	message: UIMessage;
	onApprove?: (approvalId: string) => void;
	onDeny?: (approvalId: string) => void;
}

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

export function ChatMessageItem({
	message,
	onApprove,
	onDeny,
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

	return (
		<Message from={message.role}>
			<MessageContent>
				{message.parts.map((part, i) => {
					const key = getPartKey(part, i);
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
								<MessageResponse key={key}>{part.content}</MessageResponse>
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
			{message.role === "assistant" && hasTextContent && (
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
