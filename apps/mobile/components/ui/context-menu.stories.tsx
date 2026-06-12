import type { Meta, StoryObj } from "@storybook/react-native";
import { Button } from "@/components/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuLabel,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Text } from "@/components/ui/text";

const meta = {
	title: "ui/ContextMenu",
	component: ContextMenu,
	render: () => (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<Button variant="outline">
					<Text>Long press me</Text>
				</Button>
			</ContextMenuTrigger>
			<ContextMenuContent className="w-48">
				<ContextMenuLabel>
					<Text>Actions</Text>
				</ContextMenuLabel>
				<ContextMenuSeparator />
				<ContextMenuItem>
					<Text>Back</Text>
				</ContextMenuItem>
				<ContextMenuItem>
					<Text>Reload</Text>
				</ContextMenuItem>
				<ContextMenuItem variant="destructive">
					<Text>Delete</Text>
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	),
} satisfies Meta<typeof ContextMenu>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
