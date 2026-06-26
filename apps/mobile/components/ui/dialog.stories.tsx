import type { Meta, StoryObj } from "@storybook/react-native";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Text } from "@/components/ui/text";

const meta = {
	title: "ui/Dialog",
	component: Dialog,
	render: () => (
		<Dialog>
			<DialogTrigger asChild>
				<Button variant="outline">
					<Text>Open dialog</Text>
				</Button>
			</DialogTrigger>
			<DialogContent className="w-80">
				<DialogHeader>
					<DialogTitle>Edit profile</DialogTitle>
					<DialogDescription>
						Make changes to your profile here. Tap save when you're done.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<DialogClose asChild>
						<Button>
							<Text>Save changes</Text>
						</Button>
					</DialogClose>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	),
} satisfies Meta<typeof Dialog>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
