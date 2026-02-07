import {
	CodeBlock,
	CodeBlockCopyButton,
} from "@superset/ui/ai-elements/code-block";
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
import {
	Task,
	TaskContent,
	TaskItem,
	TaskItemFile,
	TaskTrigger,
} from "@superset/ui/ai-elements/task";
import { HiMiniArrowPath, HiMiniClipboard } from "react-icons/hi2";
import type { ChatMessage } from "../../types";
import { PlanBlock } from "../PlanBlock";
import { ToolCallBlock } from "../ToolCallBlock";

export function ChatMessageItem({ message }: { message: ChatMessage }) {
	return (
		<Message from={message.role}>
			<MessageContent>
				{message.reasoning && (
					<Reasoning>
						<ReasoningTrigger />
						<ReasoningContent>{message.reasoning}</ReasoningContent>
					</Reasoning>
				)}

				{message.plan && <PlanBlock plan={message.plan} />}

				{message.content && (
					<MessageResponse>{message.content}</MessageResponse>
				)}

				{message.tasks?.map((task) => (
					<Task key={task.title}>
						<TaskTrigger title={task.title} />
						<TaskContent>
							{task.files.map((file) => (
								<TaskItem key={file}>
									<TaskItemFile>{file}</TaskItemFile>
								</TaskItem>
							))}
						</TaskContent>
					</Task>
				))}

				{message.codeBlocks?.map((block) => (
					<CodeBlock
						key={block.code}
						code={block.code}
						language={block.language as "typescript"}
					>
						<CodeBlockCopyButton />
					</CodeBlock>
				))}

				{message.toolCalls?.map((tc) => (
					<ToolCallBlock key={tc.id} toolCall={tc} />
				))}
			</MessageContent>

			{message.role === "assistant" && message.content && (
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
