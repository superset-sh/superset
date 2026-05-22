import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { ChatViewPendingActionPill } from "./ChatViewPendingActionPill";

const meta: Meta<typeof ChatViewPendingActionPill> = {
	title: "Views/Chat/02-ChatView · Pause · pending-action pill",
	component: ChatViewPendingActionPill,
	parameters: {
		docs: {
			description: {
				component:
					"UC-PAUSE-04 §A — floating warning pill above the composer when the user has dismissed a pause without responding. Three variants: approval (target + ↓) · question (warning + ↑) · plan (sparkles + ↑). Tap the pill to see the FadeOut animation.",
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
	args: { kind: "approval", count: 1, visible: true },
	argTypes: {
		kind: {
			control: { type: "select" },
			options: ["approval", "question", "plan"],
		},
		count: {
			control: { type: "number", min: 0, max: 9 },
			description: "Used only by the `approval` kind to prefix the label.",
		},
		visible: { control: "boolean" },
	},
};

export default meta;

type Story = StoryObj<typeof ChatViewPendingActionPill>;

export const SinglePending: Story = {};
export const ThreeQueued: Story = { args: { count: 3 } };
export const Question: Story = { args: { kind: "question" } };
export const Plan: Story = { args: { kind: "plan" } };
