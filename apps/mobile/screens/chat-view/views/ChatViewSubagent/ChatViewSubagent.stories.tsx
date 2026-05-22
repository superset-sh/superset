import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { ChatViewSubagent } from "./ChatViewSubagent";

const meta: Meta<typeof ChatViewSubagent> = {
	title: "Views/Chat/02-ChatView · Subagent",
	component: ChatViewSubagent,
	parameters: {
		docs: {
			description: {
				component:
					"UC-RENDER-06 §A — nested subagent execution rendered as a left-indented collapsible block (CollapsedBlock --subagent). Demonstrates the visual hierarchy used for delegated work.",
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

type Story = StoryObj<typeof ChatViewSubagent>;

export const Default: Story = {};
