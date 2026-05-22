import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { ChatViewModelPicker } from "./ChatViewModelPicker";

const meta: Meta<typeof ChatViewModelPicker> = {
	title: "Views/Chat/02-ChatView · Model picker popover",
	component: ChatViewModelPicker,
	parameters: {
		docs: {
			description: {
				component:
					"UC-COMP-04 §A — model picker floating above the composer. Anthropic + OpenAI sections, radio selection, 'NEW' badge on Opus 4.7 and GPT-5. The selected row updates the Composer settings pill in real time (useState).",
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
	args: { open: true, defaultModelId: "sonnet-4-6" },
	argTypes: {
		open: { control: "boolean" },
		defaultModelId: {
			control: { type: "select" },
			options: ["opus-4-7", "sonnet-4-6", "haiku-4-5", "gpt-5", "gpt-4o"],
		},
	},
};

export default meta;

type Story = StoryObj<typeof ChatViewModelPicker>;

export const SonnetSelected: Story = {};

export const OpusSelected: Story = {
	args: { defaultModelId: "opus-4-7" },
};

export const OpenAISelected: Story = {
	args: { defaultModelId: "gpt-5" },
};

export const Closed: Story = { args: { open: false } };
