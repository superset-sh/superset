import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { PauseApprovalOverlay } from "./PauseApprovalOverlay";

const meta: Meta<typeof PauseApprovalOverlay> = {
	title: "Organisms/PauseApprovalOverlay",
	component: PauseApprovalOverlay,
	parameters: {
		docs: {
			description: {
				component:
					"Approval pause overlay (UC-PAUSE-01). Renders an inline PendingApprovalCard in the thread above a sticky ApprovalFooter — the host Composer must be hidden while this is visible. Pass `resolving` to dim the action row and show the matching button spinner during the optimistic tap. Composes PendingApprovalCard + ApprovalFooter molecules.",
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
		title: "Run shell command",
		subtitle: "claude requesting permission",
		argsPreview: "rm -rf node_modules && bun install",
		alwaysAllowable: true,
		cardState: "pending",
		queueIndex: 1,
		queueCount: 1,
		header: (
			<Text className="text-muted-foreground">
				The assistant wants to reinstall node_modules. Approve to continue.
			</Text>
		),
	},
	argTypes: {
		title: { control: "text" },
		subtitle: { control: "text" },
		argsPreview: { control: "text" },
		alwaysAllowable: { control: "boolean" },
		cardState: {
			control: { type: "select" },
			options: ["pending", "resolving", "approved", "declined"],
		},
		resolving: {
			control: { type: "select" },
			options: ["__none__", "decline", "approve", "always"],
			mapping: { __none__: undefined },
		},
		queueIndex: { control: { type: "number", min: 1, max: 10, step: 1 } },
		queueCount: { control: { type: "number", min: 1, max: 10, step: 1 } },
	},
};

export default meta;

type Story = StoryObj<typeof PauseApprovalOverlay>;

export const SingleApproval: Story = {};

export const QueuedApproval: Story = {
	args: { queueIndex: 1, queueCount: 4 },
};

export const ResolvingApprove: Story = {
	args: { resolving: "approve" },
};

export const ResolvingDecline: Story = {
	args: { resolving: "decline" },
};
