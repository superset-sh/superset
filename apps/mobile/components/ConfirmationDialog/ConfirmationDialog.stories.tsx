import type { Meta, StoryObj } from "@storybook/react-native";
import { useState } from "react";
import { View } from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import {
	ConfirmationDialog,
	type ConfirmationDialogProps,
} from "./ConfirmationDialog";

type ShowcaseProps = Omit<ConfirmationDialogProps, "open" | "onOpenChange"> & {
	triggerLabel: string;
};

function ConfirmationDialogShowcase({
	triggerLabel,
	onConfirm,
	onCancel,
	...rest
}: ShowcaseProps) {
	const [open, setOpen] = useState(false);
	return (
		<View className="flex-1 items-center justify-center bg-background p-6">
			<Button
				variant={rest.destructive ? "destructive" : "default"}
				onPress={() => setOpen(true)}
			>
				<Text>{triggerLabel}</Text>
			</Button>
			<ConfirmationDialog
				{...rest}
				open={open}
				onOpenChange={setOpen}
				onConfirm={() => {
					onConfirm?.();
					setOpen(false);
				}}
				onCancel={() => {
					onCancel?.();
					setOpen(false);
				}}
			/>
		</View>
	);
}

const meta: Meta<typeof ConfirmationDialogShowcase> = {
	title: "Organisms/ConfirmationDialog",
	component: ConfirmationDialogShowcase,
	parameters: {
		docs: {
			description: {
				component:
					"Confirmation modal for destructive / irreversible actions. UC-SESS-05 (delete session) is the canonical caller. Composes the vendor AlertDialog primitive: backdrop + centered card + Cancel/Action footer. Controlled via `open` / `onOpenChange`.",
			},
		},
		layout: "fullscreen",
	},
	args: {
		triggerLabel: "Delete session",
		title: "Delete this session?",
		description:
			"This will permanently remove the session and its messages. This cannot be undone.",
		confirmLabel: "Delete",
		cancelLabel: "Cancel",
		destructive: true,
	},
	argTypes: {
		triggerLabel: { control: "text" },
		title: { control: "text" },
		description: { control: "text" },
		confirmLabel: { control: "text" },
		cancelLabel: { control: "text" },
		destructive: {
			control: "boolean",
			description: "Use destructive variant for the confirm button",
		},
	},
};

export default meta;

type Story = StoryObj<typeof ConfirmationDialogShowcase>;

export const DeleteSession: Story = {};

export const SignOut: Story = {
	args: {
		triggerLabel: "Sign out",
		title: "Sign out of Superset?",
		description: "You'll need to sign in again to access your sessions.",
		confirmLabel: "Sign out",
		destructive: false,
	},
};

export const EndSession: Story = {
	args: {
		triggerLabel: "End session",
		title: "End this session?",
		description:
			"Ending will stop the active conversation. You can rejoin later.",
		confirmLabel: "End",
		destructive: false,
	},
};
