import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { ChatViewReasoningPlan } from "./ChatViewReasoningPlan";

const meta: Meta<typeof ChatViewReasoningPlan> = {
	title: "Views/Chat/02-ChatView · Plan + Reasoning",
	component: ChatViewReasoningPlan,
	parameters: {
		docs: {
			description: {
				component:
					"UC-RENDER-05 §A — Plan and Reasoning collapsed blocks coexisting. The Plan block starts expanded (default-open) so the body is visible; the Reasoning block is collapsed by default. Tap either header to toggle in storybook.",
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

type Story = StoryObj<typeof ChatViewReasoningPlan>;

export const PlanOpenReasoningClosed: Story = {};
