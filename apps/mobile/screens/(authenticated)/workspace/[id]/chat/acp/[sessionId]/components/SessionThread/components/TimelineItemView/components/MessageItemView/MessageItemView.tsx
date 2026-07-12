import type { ContentBlock, MessageItem } from "@superset/session-protocol";
import { CircleAlertIcon } from "lucide-react-native";
import { View } from "react-native";
import { MessageResponse } from "@/components/ai-elements/message";
import {
	Reasoning,
	ReasoningContent,
	ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

function blocksToText(blocks: ContentBlock[]): string {
	return blocks
		.map((block) => {
			if (block.type === "text") return block.text;
			if (block.type === "resource_link") return block.uri;
			return `[${block.type}]`;
		})
		.join("");
}

/**
 * Same visual language as the mastra ChatMessageList bubbles: user messages
 * sit in a bordered right-aligned bubble, agent messages are borderless
 * full-width markdown prose, and thoughts collapse behind a Reasoning trigger.
 */
export function MessageItemView({ item }: { item: MessageItem }) {
	const text = blocksToText(item.blocks);
	if (!text.trim()) return null;

	if (item.role === "thought") {
		return (
			<Reasoning className="mb-0 mt-1">
				<ReasoningTrigger />
				<ReasoningContent>{text}</ReasoningContent>
			</Reasoning>
		);
	}

	if (item.role === "user") {
		// A failed prompt (session/prompt rejected after the message was
		// journaled) shifts the bubble left for an iMessage-style alert mark.
		return (
			<View className="flex-row items-center justify-end gap-2">
				<View className="border-border max-w-[85%] rounded-2xl rounded-br-md border px-3 py-2">
					<Text className="text-foreground text-[15px] leading-5">{text}</Text>
				</View>
				{item.failed ? (
					<Icon as={CircleAlertIcon} className="size-4 text-destructive/80" />
				) : null}
			</View>
		);
	}

	return (
		<View className="px-0.5 py-1">
			<MessageResponse>{text}</MessageResponse>
		</View>
	);
}
