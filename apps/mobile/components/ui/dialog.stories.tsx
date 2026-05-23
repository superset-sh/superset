import type { Meta, StoryObj } from "@storybook/react-native";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/text";

function DialogShowcase({
	triggerLabel,
	title,
	description,
	confirmLabel,
}: {
	triggerLabel: string;
	title: string;
	description: string;
	confirmLabel: string;
}) {
	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button variant="outline">
					<Text>{triggerLabel}</Text>
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>
				<Label>Session title</Label>
				<Input placeholder="Rename..." />
				<DialogFooter>
					<Button>
						<Text>{confirmLabel}</Text>
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

const meta: Meta<typeof DialogShowcase> = {
	title: "Components/Dialog",
	component: DialogShowcase,
	parameters: {
		docs: {
			description: {
				component:
					"Non-destructive modal. Used for Rename session, settings forms. Has built-in X close affordance top-right (44pt hitSlop). Renders via portal.",
			},
		},
	},
	args: {
		triggerLabel: "Rename session",
		title: "Rename session",
		description: "Choose a clear title that helps you find this session later.",
		confirmLabel: "Save",
	},
	argTypes: {
		triggerLabel: { control: "text" },
		title: { control: "text" },
		description: { control: "text" },
		confirmLabel: { control: "text" },
	},
};

export default meta;

type Story = StoryObj<typeof DialogShowcase>;

export const RenameSession: Story = {};
