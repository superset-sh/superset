import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { ChatViewMarkdown } from "./ChatViewMarkdown";

const meta: Meta<typeof ChatViewMarkdown> = {
	title: "Views/Chat/02-ChatView · Markdown",
	component: ChatViewMarkdown,
	parameters: {
		docs: {
			description: {
				component:
					"UC-RENDER-03 §A — markdown rendering with a fenced code block (Copy + language label) and inline code. Tap the Copy chip inside the CodeBlock to see the local toast appear (storybook `useState` keeps the demo interactive).",
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
};

export default meta;

type Story = StoryObj<typeof ChatViewMarkdown>;

export const Default: Story = {};
