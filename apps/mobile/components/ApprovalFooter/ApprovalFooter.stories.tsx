import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { ApprovalFooter } from "./ApprovalFooter";

const meta: Meta<typeof ApprovalFooter> = {
	title: "Molecules/ApprovalFooter",
	component: ApprovalFooter,
	parameters: {
		docs: {
			description: {
				component:
					"Sticky footer above composer during a tool-approval pause (UC-PAUSE-01 §A). Top amber ToolStatusRule + optional queue Badge + 3 Buttons (Decline / Approve / Always). Order is intentional one-handed UX: Approve in center thumb zone, Decline outer to reduce accidental taps. `resolving` dims row + spinner on indicated button. Composes ToolStatusRule + Badge + Button.",
			},
		},
		layout: "fullscreen",
	},
	args: {
		queueCount: 1,
		queueIndex: 1,
		disabled: false,
	},
	argTypes: {
		queueCount: {
			control: { type: "number", min: 1, max: 9 },
			description: "Total approvals queued (counter shows when > 1)",
		},
		queueIndex: {
			control: { type: "number", min: 1, max: 9 },
			description: "Current 1-indexed position in queue",
		},
		resolving: {
			control: { type: "select" },
			options: ["(none)", "decline", "approve", "always"],
			mapping: {
				"(none)": undefined,
				decline: "decline",
				approve: "approve",
				always: "always",
			},
			description: "Show spinner on indicated button + dim row",
		},
		disabled: { control: "boolean" },
	},
};

export default meta;

type Story = StoryObj<typeof ApprovalFooter>;

export const Single: Story = {};

export const Queued: Story = {
	args: { queueCount: 4, queueIndex: 1 },
};

export const ResolvingApprove: Story = {
	args: { resolving: "approve" },
};

export const ResolvingDecline: Story = {
	args: { resolving: "decline" },
};

export const ResolvingAlways: Story = {
	args: { resolving: "always" },
};

export const Disabled: Story = {
	args: { disabled: true },
};

export const InContextWithRule: Story = {
	render: () => (
		<View className="gap-0">
			<View className="bg-background h-32 border-b border-border items-center justify-center">
				<View className="bg-card border border-border rounded-lg p-3 max-w-sm">
					{/* PendingApprovalCard would mount here in real flow */}
				</View>
			</View>
			<ApprovalFooter queueCount={3} queueIndex={2} />
		</View>
	),
};
