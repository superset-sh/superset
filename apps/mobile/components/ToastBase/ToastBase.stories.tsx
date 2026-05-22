import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { ToastBase } from "./ToastBase";

const meta: Meta<typeof ToastBase> = {
	title: "Components/ToastBase",
	component: ToastBase,
	parameters: {
		docs: {
			description: {
				component:
					"Transient notification surface composing internal atoms (ToolStatusRule + Icon + Text + HitTargetWrapper). Five variants (info default · success · warning · danger · loading) × two shapes (inline default · stacked for longer messages). Variant color conveyed via 3px left rule + matching icon tint; surface stays neutral bg-popover. Caller manages timeout + position.",
			},
		},
		layout: "centered",
	},
	args: {
		variant: "info",
		shape: "inline",
		body: "Session renamed",
	},
	argTypes: {
		variant: {
			control: { type: "select" },
			options: ["info", "success", "warning", "danger", "loading"],
			description:
				"info (default) · success (rename, send confirm) · warning (reconnecting) · danger (failed) · loading (connecting, downloading)",
		},
		shape: {
			control: { type: "select" },
			options: ["inline", "stacked"],
			description:
				"inline (icon · body · actions one row) · stacked (title + body + action vertically)",
		},
		body: {
			control: "text",
			description: "Body text — always present",
		},
		title: {
			control: "text",
			description: "Title text — stacked shape only; bold above body",
		},
		dismissAccessibilityLabel: {
			control: "text",
			description: "Override the ✕ button label (default 'Dismiss')",
		},
	},
};

export default meta;

type Story = StoryObj<typeof ToastBase>;

export const InfoInline: Story = {
	args: { body: "1 update available" },
};

export const SuccessInline: Story = {
	args: { variant: "success", body: "Session renamed to ‘refactor-relay’" },
};

export const WarningInline: Story = {
	args: { variant: "warning", body: "Host reconnecting…" },
};

export const DangerInline: Story = {
	args: { variant: "danger", body: "Failed to send message" },
};

export const LoadingInline: Story = {
	args: { variant: "loading", body: "Downloading update…" },
};

export const WithDismiss: Story = {
	args: {
		variant: "success",
		body: "Session renamed",
		onDismiss: () => {},
	},
};

export const WithAction: Story = {
	args: {
		variant: "danger",
		body: "Failed to send message",
		action: (
			<Button size="sm" variant="outline">
				<Text>Retry</Text>
			</Button>
		),
		onDismiss: () => {},
	},
};

export const StackedWithCTA: Story = {
	args: {
		variant: "warning",
		shape: "stacked",
		title: "Host offline",
		body: "The macbook-pro host hasn't responded in 45 seconds. New messages will queue until it reconnects.",
		action: (
			<Button size="sm" variant="default">
				<Text>Reconnect</Text>
			</Button>
		),
		onDismiss: () => {},
	},
};

export const AllVariantsInline: Story = {
	render: () => (
		<View className="gap-2 w-full max-w-sm p-4">
			<ToastBase variant="info" body="1 update available" />
			<ToastBase variant="success" body="Session renamed" />
			<ToastBase variant="warning" body="Host reconnecting…" />
			<ToastBase variant="danger" body="Failed to send message" />
			<ToastBase variant="loading" body="Downloading update…" />
		</View>
	),
};
