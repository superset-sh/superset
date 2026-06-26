import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import {
	Reasoning,
	ReasoningContent,
	ReasoningTrigger,
} from "@/components/ai-elements/reasoning";

const REASONING_MARKDOWN = `The user wants the conversation list pinned to the bottom while streaming.

1. Track the distance from the bottom on every scroll event
2. Re-pin when new content arrives within the threshold

This avoids interrupting the user when they scroll up to read history.`;

const meta = {
	title: "ai-elements/Reasoning",
	component: Reasoning,
} satisfies Meta<typeof Reasoning>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Streaming: Story = {
	render: () => (
		<View className="w-full">
			<Reasoning isStreaming>
				<ReasoningTrigger />
				<ReasoningContent>{REASONING_MARKDOWN}</ReasoningContent>
			</Reasoning>
		</View>
	),
};

export const Done: Story = {
	render: () => (
		<View className="w-full">
			<Reasoning defaultOpen duration={4}>
				<ReasoningTrigger />
				<ReasoningContent>{REASONING_MARKDOWN}</ReasoningContent>
			</Reasoning>
		</View>
	),
};

export const DoneCollapsed: Story = {
	render: () => (
		<View className="w-full">
			<Reasoning duration={12}>
				<ReasoningTrigger />
				<ReasoningContent>{REASONING_MARKDOWN}</ReasoningContent>
			</Reasoning>
		</View>
	),
};
