import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { PendingActionPill } from "./PendingActionPill";

const meta: Meta<typeof PendingActionPill> = {
	title: "Molecules/PendingActionPill",
	component: PendingActionPill,
	parameters: {
		docs: {
			description: {
				component:
					"Floating pill above the composer when a session has an active pause and user scrolled away (UC-PAUSE-04). 3 kinds — approval (target + ↓) · question (warning + ↑) · plan (sparkles + ↑). Reanimated FadeIn/Out via `visible` prop. Warning amber palette. Composes Icon + Text.",
			},
		},
		layout: "centered",
	},
	args: {
		kind: "approval",
		count: 1,
		visible: true,
		disabled: false,
	},
	argTypes: {
		kind: {
			control: { type: "select" },
			options: ["approval", "question", "plan"],
		},
		label: {
			control: "text",
			description: "Override default label ('1 PENDING' / 'QUESTION' / 'PLAN')",
		},
		count: {
			control: "number",
			description: "Count prefix — approval kind only",
		},
		direction: {
			control: { type: "select" },
			options: ["(default)", "down", "up", "(none)"],
			mapping: {
				"(default)": undefined,
				down: "down",
				up: "up",
				"(none)": null,
			},
		},
		visible: { control: "boolean", description: "Toggles FadeIn/FadeOut" },
		disabled: { control: "boolean" },
	},
};

export default meta;

type Story = StoryObj<typeof PendingActionPill>;

export const Approval: Story = {};

export const Question: Story = {
	args: { kind: "question" },
};

export const Plan: Story = {
	args: { kind: "plan" },
};

export const MultipleApprovals: Story = {
	args: { count: 3 },
};

export const NoDirectionArrow: Story = {
	args: { direction: null },
};

export const Hidden: Story = {
	args: { visible: false },
	parameters: {
		docs: {
			description: {
				story:
					"visible=false → FadeOut animation; component returns null when fully faded.",
			},
		},
	},
};

export const AllKinds: Story = {
	render: () => (
		<View className="gap-2 items-start p-4">
			<PendingActionPill kind="approval" count={1} />
			<PendingActionPill kind="approval" count={3} />
			<PendingActionPill kind="question" />
			<PendingActionPill kind="plan" />
		</View>
	),
};
