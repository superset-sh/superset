import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { ChatViewToolCalls } from "./ChatViewToolCalls";

const meta: Meta<typeof ChatViewToolCalls> = {
	title: "Views/Chat/02-ChatView · Tool calls",
	component: ChatViewToolCalls,
	parameters: {
		docs: {
			description: {
				component:
					"UC-RENDER-04 §A — three tool-call cards in the thread showing the status arc: `running` (loading), `done` (completed), `error` (failed). All three render simultaneously so reviewers can compare visual treatments at a glance.",
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

type Story = StoryObj<typeof ChatViewToolCalls>;

export const ThreeStates: Story = {};
