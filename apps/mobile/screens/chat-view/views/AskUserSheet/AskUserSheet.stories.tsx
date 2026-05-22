import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { AskUserSheet } from "./AskUserSheet";

const meta: Meta<typeof AskUserSheet> = {
	title: "Views/Chat/02-ChatView · Pause · ask_user sheet",
	component: AskUserSheet,
	parameters: {
		docs: {
			description: {
				component:
					"UC-PAUSE-02 §A — ask_user bottom sheet over a dimmed chat view. Question + suggested-answer pills (tap to prefill) + BottomSheetTextInput (keyboard-aware) + Cancel/Send actions. Drag the handle or tap the backdrop to dismiss.",
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
	args: {
		question: "Which approach should I use?",
		suggestions: ["tRPC", "REST API", "Both"],
		autoPresent: true,
		onSubmit: () => {},
	},
	argTypes: {
		question: { control: "text" },
		autoPresent: { control: "boolean" },
	},
};

export default meta;

type Story = StoryObj<typeof AskUserSheet>;

export const Default: Story = {};

export const LongerQuestion: Story = {
	args: {
		question:
			"We can ship this two ways — fast and risky, or slow and safe. Which do you want?",
		suggestions: ["Fast and risky", "Slow and safe", "Discuss tradeoffs"],
	},
};
