import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { ChatViewThinkingPicker } from "./ChatViewThinkingPicker";

const meta: Meta<typeof ChatViewThinkingPicker> = {
	title: "Views/Chat/02-ChatView · Thinking-level popover",
	component: ChatViewThinkingPicker,
	parameters: {
		docs: {
			description: {
				component:
					"UC-COMP-05 §A — thinking-level picker popover. Five rows (off · low · medium · high · xhigh) with token-budget hints. Selection updates the composer settings pill via useState.",
			},
		},
		layout: "fullscreen",
	},
	decorators: [
		(Story) => (
			<View className="flex-1 bg-background">
				<Story />
			</View>
		),
	],
	args: { open: true, defaultLevel: "low" },
	argTypes: {
		open: { control: "boolean" },
		defaultLevel: {
			control: { type: "select" },
			options: ["off", "low", "medium", "high", "xhigh"],
		},
	},
};

export default meta;

type Story = StoryObj<typeof ChatViewThinkingPicker>;

export const Low: Story = {};
export const Medium: Story = { args: { defaultLevel: "medium" } };
export const Extreme: Story = { args: { defaultLevel: "xhigh" } };
export const Closed: Story = { args: { open: false } };
