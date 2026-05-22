import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { ChatViewPauseApproval } from "./ChatViewPauseApproval";

const meta: Meta<typeof ChatViewPauseApproval> = {
	title: "Views/Chat/02-ChatView · Pause · approval inline + footer",
	component: ChatViewPauseApproval,
	parameters: {
		docs: {
			description: {
				component:
					"UC-PAUSE-01 §A — inline pending-approval card + sticky Approve/Decline/Always footer. Composer is suppressed so the footer owns the input region. Tap any action to see the resolving spinner (useState in the view component drives the transition).",
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
	args: { queueCount: 1, queueIndex: 1, onDecision: () => {} },
	argTypes: {
		queueCount: { control: { type: "number", min: 1, max: 9 } },
		queueIndex: { control: { type: "number", min: 1, max: 9 } },
	},
};

export default meta;

type Story = StoryObj<typeof ChatViewPauseApproval>;

export const SingleApproval: Story = {};

export const QueuedOneOfFour: Story = {
	args: { queueCount: 4, queueIndex: 1 },
};
