import type { Meta, StoryObj } from "@storybook/react-native";
import { TerminalIcon } from "lucide-react-native";
import * as React from "react";
import { View } from "react-native";
import {
	Conversation,
	ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
	Message,
	MessageContent,
	MessageResponse,
} from "@/components/ai-elements/message";
import {
	type ChatStatus,
	PromptInput,
	PromptInputBody,
	PromptInputFooter,
	type PromptInputMessage,
	PromptInputSubmit,
	PromptInputTextarea,
	PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import {
	Reasoning,
	ReasoningContent,
	ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { ToolCallRow } from "@/components/ai-elements/tool-call-row";
import { Text } from "@/components/ui/text";

type ChatItem = {
	id: string;
	role: "user" | "assistant";
	text: string;
	reasoning?: string;
	tool?: { title: string; description: string };
};

const SEED_ITEMS: ChatItem[] = [
	{
		id: "1",
		role: "user",
		text: "How does the conversation component stay pinned to the bottom?",
	},
	{
		id: "2",
		role: "assistant",
		reasoning:
			"The user asks about stick-to-bottom behavior. I should explain the LegendList re-pin mechanism.",
		tool: {
			description: "rg maintainScrollAtEnd components/",
			title: "bash",
		},
		text: "It uses **LegendList** with `maintainScrollAtEnd`, which re-pins whenever:\n\n1. New items are appended\n2. The *last item grows* while streaming\n3. The container resizes (keyboard)\n\nScroll up and the pin releases until you tap the scroll-to-bottom button.",
	},
	{
		id: "3",
		role: "user",
		text: "Show me with a streaming reply!",
	},
];

const STREAM_REPLY =
	"Sure — this reply is being **streamed token by token**.\n\n- The list stays pinned while this message grows\n- `MessageResponse` repairs incomplete markdown via *remend*\n- Code stays highlighted: `maintainScrollAtEnd` ✓\n\nTry scrolling up mid-stream: the pin releases, and the scroll button appears.";

function ChatDemoStory() {
	const [items, setItems] = React.useState<ChatItem[]>(SEED_ITEMS);
	const [status, setStatus] = React.useState<ChatStatus>("ready");
	const streamTimer = React.useRef<ReturnType<typeof setInterval> | null>(null);

	const stopStreaming = React.useCallback(() => {
		if (streamTimer.current) {
			clearInterval(streamTimer.current);
			streamTimer.current = null;
		}
		setStatus("ready");
	}, []);

	React.useEffect(() => stopStreaming, [stopStreaming]);

	const streamAssistantReply = React.useCallback(() => {
		const id = `assistant-${Date.now()}`;
		setItems((current) => [...current, { id, role: "assistant", text: "" }]);
		setStatus("streaming");
		let index = 0;
		streamTimer.current = setInterval(() => {
			index = Math.min(index + 4, STREAM_REPLY.length);
			const text = STREAM_REPLY.slice(0, index);
			setItems((current) =>
				current.map((item) => (item.id === id ? { ...item, text } : item)),
			);
			if (index >= STREAM_REPLY.length) {
				stopStreaming();
			}
		}, 60);
	}, [stopStreaming]);

	const handleSubmit = React.useCallback(
		(message: PromptInputMessage) => {
			setItems((current) => [
				...current,
				{ id: `user-${Date.now()}`, role: "user", text: message.text },
			]);
			setStatus("submitted");
			setTimeout(streamAssistantReply, 600);
		},
		[streamAssistantReply],
	);

	const renderItem = React.useCallback(
		({ item }: { item: ChatItem }) => (
			<View className="pb-6">
				<Message from={item.role}>
					{item.reasoning ? (
						<Reasoning duration={2} isStreaming={false}>
							<ReasoningTrigger />
							<ReasoningContent>{item.reasoning}</ReasoningContent>
						</Reasoning>
					) : null}
					{item.tool ? (
						<ToolCallRow
							description={item.tool.description}
							icon={TerminalIcon}
							title={item.tool.title}
						/>
					) : null}
					<MessageContent>
						{item.role === "assistant" ? (
							<MessageResponse>{item.text}</MessageResponse>
						) : (
							<Text className="text-sm">{item.text}</Text>
						)}
					</MessageContent>
				</Message>
			</View>
		),
		[],
	);

	return (
		<View className="bg-background h-[640px] w-full">
			<Conversation
				contentContainerClassName="p-4"
				data={items}
				keyExtractor={(item: ChatItem) => item.id}
				renderItem={renderItem}
			>
				<ConversationScrollButton />
			</Conversation>
			<View className="p-3">
				<PromptInput onSubmit={handleSubmit}>
					<PromptInputBody>
						<PromptInputTextarea />
					</PromptInputBody>
					<PromptInputFooter>
						<PromptInputTools />
						<PromptInputSubmit onStop={stopStreaming} status={status} />
					</PromptInputFooter>
				</PromptInput>
			</View>
		</View>
	);
}

const meta = {
	title: "ai-elements/ChatDemo",
} satisfies Meta<Record<string, never>>;

export default meta;

type Story = StoryObj<typeof meta>;

export const FullChat: Story = {
	render: () => <ChatDemoStory />,
};
