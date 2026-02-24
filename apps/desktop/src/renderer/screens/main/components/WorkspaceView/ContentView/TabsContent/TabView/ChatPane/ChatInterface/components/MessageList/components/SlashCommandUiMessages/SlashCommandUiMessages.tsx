import { Message, MessageContent } from "@superset/ui/ai-elements/message";
import type { SlashCommandUiMessage } from "../../../../types";
import { McpOverviewCard } from "../McpOverviewCard";

interface SlashCommandUiMessagesProps {
	messages: SlashCommandUiMessage[];
}

export function SlashCommandUiMessages({
	messages,
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
					/>
				</MessageContent>
			</Message>
		);
	});
}
