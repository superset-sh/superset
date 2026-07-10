import type { Meta, StoryObj } from "@storybook/react-native";
import { CopyIcon, RefreshCwIcon, ThumbsUpIcon } from "lucide-react-native";
import { View } from "react-native";
import {
	Message,
	MessageAction,
	MessageActions,
	MessageContent,
	MessageResponse,
} from "@/components/ai-elements/message";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

const ASSISTANT_MARKDOWN = `Here's how **stick-to-bottom** works:

1. Track the distance from the bottom on every scroll event
2. Re-pin when new content arrives within the threshold

\`\`\`ts
const distanceFromBottom =
	contentSize.height - layoutMeasurement.height - contentOffset.y;
\`\`\`

> The list only re-pins while you're near the bottom, so scrolling up to read history is never interrupted.

| Prop | Default |
| --- | --- |
| \`maintainScrollAtEndThreshold\` | 0.15 |
| \`recycleItems\` | false |
`;

const meta = {
	title: "ai-elements/Message",
	component: Message,
} satisfies Meta<typeof Message>;

export default meta;

type Story = StoryObj<typeof meta>;

export const UserMessage: Story = {
	args: { from: "user" },
	render: (args) => (
		<View className="w-full">
			<Message {...args}>
				<MessageContent>
					<Text>
						Can you explain how the conversation list stays pinned to the bottom
						while streaming?
					</Text>
				</MessageContent>
			</Message>
		</View>
	),
};

export const AssistantMarkdown: Story = {
	args: { from: "assistant" },
	render: (args) => (
		<View className="w-full">
			<Message {...args}>
				<MessageContent>
					<MessageResponse>{ASSISTANT_MARKDOWN}</MessageResponse>
				</MessageContent>
			</Message>
		</View>
	),
};

export const WithActions: Story = {
	args: { from: "assistant" },
	render: (args) => (
		<View className="w-full">
			<Message {...args}>
				<MessageContent>
					<MessageResponse>
						Sure — the scroll button only appears once you scroll away from the
						bottom.
					</MessageResponse>
				</MessageContent>
				<MessageActions>
					<MessageAction label="Copy" tooltip="Copy">
						<Icon as={CopyIcon} className="size-4 text-muted-foreground" />
					</MessageAction>
					<MessageAction label="Retry" tooltip="Retry">
						<Icon as={RefreshCwIcon} className="size-4 text-muted-foreground" />
					</MessageAction>
					<MessageAction label="Good response">
						<Icon as={ThumbsUpIcon} className="size-4 text-muted-foreground" />
					</MessageAction>
				</MessageActions>
			</Message>
		</View>
	),
};
