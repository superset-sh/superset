import type { Meta, StoryObj } from "@storybook/react-native";
import { MessageCircleIcon } from "lucide-react-native";
import * as React from "react";
import { View } from "react-native";
import {
	Conversation,
	ConversationEmptyState,
	ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
	Message,
	MessageContent,
	MessageResponse,
	type MessageRole,
} from "@/components/ai-elements/message";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

interface DemoMessage {
	id: string;
	role: MessageRole;
	text: string;
}

const QUESTIONS = [
	"How do I virtualize a chat list?",
	"What about keeping it pinned to the bottom?",
	"Does that break when I scroll up to read history?",
	"How do I jump back down?",
	"Can items be variable height?",
	"What's the re-pin threshold?",
	"How does streaming text affect layout?",
];

const ANSWERS = [
	"Use a virtualized list so only visible rows mount.",
	"Enable `maintainScrollAtEnd` so appended content re-pins the viewport.",
	"No — re-pinning only happens while you're near the bottom.",
	"A scroll-to-bottom button appears once you leave the bottom.",
	"Yes, item layout changes also trigger the end-pin.",
	"It's a fraction of the viewport height, `0.15` here.",
	"Each token append re-measures the row and keeps the list pinned.",
];

const SEED_MESSAGES: DemoMessage[] = Array.from({ length: 15 }, (_, index) =>
	index % 2 === 0
		? {
				id: `message-${index}`,
				role: "user" as const,
				text: QUESTIONS[(index / 2) % QUESTIONS.length] ?? "",
			}
		: {
				id: `message-${index}`,
				role: "assistant" as const,
				text: ANSWERS[((index - 1) / 2) % ANSWERS.length] ?? "",
			},
);

const STREAMED_RESPONSE = `Let's recap how the **stick-to-bottom** conversation works:

1. The list starts scrolled to the end
2. Every appended token re-measures the last row
3. While you're near the bottom, the list re-pins automatically
4. Scrolling up shows the floating scroll button instead

\`\`\`ts
maintainScrollAtEnd={{
	animated: false,
	on: { dataChange: true, itemLayout: true, layout: true },
}}
\`\`\`

> Scroll up while this streams — the list should stay where you are, and the arrow button should appear at the bottom center.`;

function StreamingConversation() {
	const [messages, setMessages] = React.useState<DemoMessage[]>(() => [
		...SEED_MESSAGES,
		{ id: "message-streaming", role: "assistant", text: "" },
	]);

	React.useEffect(() => {
		let index = 0;
		const interval = setInterval(() => {
			index = Math.min(index + 4, STREAMED_RESPONSE.length);
			const text = STREAMED_RESPONSE.slice(0, index);
			setMessages((previous) => [
				...previous.slice(0, -1),
				{ id: "message-streaming", role: "assistant", text },
			]);
			if (index >= STREAMED_RESPONSE.length) {
				clearInterval(interval);
			}
		}, 120);
		return () => clearInterval(interval);
	}, []);

	return (
		<View className="h-[500px] w-full overflow-hidden rounded-lg border border-border">
			<Conversation
				contentContainerClassName="px-4 py-4"
				data={messages}
				keyExtractor={(message) => message.id}
				renderItem={({ item }) => (
					<View className="pb-6">
						<Message from={item.role}>
							<MessageContent>
								{item.role === "assistant" ? (
									<MessageResponse>{item.text}</MessageResponse>
								) : (
									<Text>{item.text}</Text>
								)}
							</MessageContent>
						</Message>
					</View>
				)}
			>
				<ConversationScrollButton />
			</Conversation>
		</View>
	);
}

const meta = {
	title: "ai-elements/Conversation",
	component: Conversation,
} satisfies Meta<typeof Conversation>;

export default meta;

type Story = StoryObj<Record<string, never>>;

export const StickToBottomStreaming: Story = {
	render: () => <StreamingConversation />,
};

export const EmptyState: Story = {
	render: () => (
		<View className="h-[500px] w-full overflow-hidden rounded-lg border border-border">
			<Conversation<DemoMessage>
				data={[]}
				keyExtractor={(message) => message.id}
				ListEmptyComponent={
					<ConversationEmptyState
						icon={
							<Icon
								as={MessageCircleIcon}
								className="size-8 text-muted-foreground"
							/>
						}
					/>
				}
				renderItem={({ item }) => (
					<Message from={item.role}>
						<MessageContent>
							<Text>{item.text}</Text>
						</MessageContent>
					</Message>
				)}
			/>
		</View>
	),
};
