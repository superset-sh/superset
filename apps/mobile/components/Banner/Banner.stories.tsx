import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { Banner } from "./Banner";

const meta: Meta<typeof Banner> = {
	title: "Molecules/Banner",
	component: Banner,
	parameters: {
		docs: {
			description: {
				component:
					"Full-width status banner above chat content. 4 variants (offline · unpaid · dispatch-failed · permission-denied) × 2 shapes (inline · stacked). Top horizontal ToolStatusRule accent in variant color. Composes ToolStatusRule + Icon + Text + IconButton.",
			},
		},
		layout: "fullscreen",
	},
	args: {
		variant: "offline",
		shape: "inline",
		headline: "Host offline · auto-retrying in 3s",
	},
	argTypes: {
		variant: {
			control: { type: "select" },
			options: ["offline", "unpaid", "dispatch-failed", "permission-denied"],
		},
		shape: {
			control: { type: "select" },
			options: ["inline", "stacked"],
		},
		headline: { control: "text" },
		body: { control: "text", description: "Body text — stacked shape only" },
	},
};

export default meta;

type Story = StoryObj<typeof Banner>;

export const Offline: Story = {};

export const Unpaid: Story = {
	args: {
		variant: "unpaid",
		headline: "Workspace plan upgrade required",
	},
	render: (args) => (
		<Banner
			{...args}
			cta={
				<Button size="sm" variant="link">
					<Text>Upgrade</Text>
				</Button>
			}
		/>
	),
};

export const DispatchFailed: Story = {
	args: {
		variant: "dispatch-failed",
		headline: "Failed to dispatch — host unreachable",
	},
	render: (args) => (
		<Banner
			{...args}
			cta={
				<Button size="sm" variant="link">
					<Text>Retry</Text>
				</Button>
			}
		/>
	),
};

export const PermissionDeniedStacked: Story = {
	args: {
		variant: "permission-denied",
		shape: "stacked",
		headline: "Notifications disabled",
		body: "Enable notifications in iOS Settings to receive pause approvals while the app is in the background.",
	},
	render: (args) => (
		<Banner
			{...args}
			cta={
				<Button size="sm" variant="secondary">
					<Text>Open Settings →</Text>
				</Button>
			}
		/>
	),
};

export const Dismissible: Story = {
	args: {
		headline: "Host offline · auto-retrying",
		onDismiss: () => {},
	},
};

export const AllInlineVariants: Story = {
	render: () => (
		<View className="gap-2">
			<Banner variant="offline" headline="Host offline · auto-retrying" />
			<Banner variant="unpaid" headline="Plan upgrade required" />
			<Banner variant="dispatch-failed" headline="Failed to dispatch message" />
			<Banner variant="permission-denied" headline="Notifications disabled" />
		</View>
	),
};
