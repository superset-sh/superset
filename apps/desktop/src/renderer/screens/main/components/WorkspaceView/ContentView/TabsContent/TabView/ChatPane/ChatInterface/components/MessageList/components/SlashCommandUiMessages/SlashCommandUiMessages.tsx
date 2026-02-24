import { Message, MessageContent } from "@superset/ui/ai-elements/message";
import type { SlashCommandUiMessage } from "../../../../types";
import { McpOverviewCard } from "../McpOverviewCard";

interface SlashCommandUiMessagesProps {
	messages: SlashCommandUiMessage[];
	onDismissMessage?: (messageId: string) => void;
}

export function SlashCommandUiMessages({
	messages,
	onDismissMessage,
}: SlashCommandUiMessagesProps) {
	return messages.map((message) => {
		if (message.type !== "mcp_overview") {
			return null;
		}

		return (
			<Message key={message.id} from="assistant">
				<MessageContent>
					<McpOverviewCard
						sourcePath={message.sourcePath}
						servers={message.servers}
						onDismiss={
							onDismissMessage
								? () => {
										onDismissMessage(message.id);
									}
								: undefined
						}
					/>
				</MessageContent>
			</Message>
		);
	});
}
