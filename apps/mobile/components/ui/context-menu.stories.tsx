import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Text } from "@/components/ui/text";

function ContextMenuShowcase() {
	return (
		<ContextMenu>
			<ContextMenuTrigger>
				<View className="bg-card border-border rounded-md border p-4">
					<Text>Long-press this card</Text>
				</View>
			</ContextMenuTrigger>
			<ContextMenuContent>
				<ContextMenuItem>
					<Text>Rename</Text>
				</ContextMenuItem>
				<ContextMenuItem>
					<Text>End session</Text>
				</ContextMenuItem>
				<ContextMenuSeparator />
				<ContextMenuItem>
					<Text className="text-destructive">Delete</Text>
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}

const meta: Meta<typeof ContextMenuShowcase> = {
	title: "Components/ContextMenu",
	component: ContextMenuShowcase,
	parameters: {
		docs: {
			description: {
				component:
					"Long-press action menu. Used for session-row long-press (Rename/End/Delete). Mobile uses native long-press; menu renders via portal.",
			},
		},
	},
};

export default meta;

type Story = StoryObj<typeof ContextMenuShowcase>;

export const SessionRowActions: Story = {};
