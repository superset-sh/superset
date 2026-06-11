import type { Meta, StoryObj } from "@storybook/react-native";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

function AlertDialogShowcase({
	triggerLabel,
	title,
	description,
	confirmLabel,
	cancelLabel,
}: {
	triggerLabel: string;
	title: string;
	description: string;
	confirmLabel: string;
	cancelLabel: string;
}) {
	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button variant="destructive">
					<Text>{triggerLabel}</Text>
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					<AlertDialogDescription>{description}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>
						<Text>{cancelLabel}</Text>
					</AlertDialogCancel>
					<AlertDialogAction>
						<Text>{confirmLabel}</Text>
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

const meta: Meta<typeof AlertDialogShowcase> = {
	title: "Components/AlertDialog",
	component: AlertDialogShowcase,
	parameters: {
		docs: {
			description: {
				component:
					"Confirmation modal for destructive actions. Used by Delete session dialog (UC-SESS-05). Renders via portal — PortalHost is wired in preview decorator.",
			},
		},
	},
	args: {
		triggerLabel: "Delete session",
		title: "Delete this session?",
		description:
			"This will permanently remove the session and its messages. This cannot be undone.",
		confirmLabel: "Delete",
		cancelLabel: "Cancel",
	},
	argTypes: {
		triggerLabel: { control: "text" },
		title: { control: "text" },
		description: { control: "text" },
		confirmLabel: { control: "text" },
		cancelLabel: { control: "text" },
	},
};

export default meta;

type Story = StoryObj<typeof AlertDialogShowcase>;

export const DeleteSession: Story = {};

export const SignOut: Story = {
	args: {
		triggerLabel: "Sign out",
		title: "Sign out of Superset?",
		description: "You'll need to sign in again to access your sessions.",
		confirmLabel: "Sign out",
	},
};
