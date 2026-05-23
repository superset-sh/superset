import type { Meta, StoryObj } from "@storybook/react-native";
import { useState } from "react";
import {
	Menubar,
	MenubarContent,
	MenubarItem,
	MenubarMenu,
	MenubarSeparator,
	MenubarTrigger,
} from "@/components/ui/menubar";
import { Text } from "@/components/ui/text";

function MenubarShowcase() {
	const [open, setOpen] = useState<string | undefined>(undefined);
	return (
		<Menubar value={open} onValueChange={setOpen}>
			<MenubarMenu value="file">
				<MenubarTrigger>
					<Text>File</Text>
				</MenubarTrigger>
				<MenubarContent>
					<MenubarItem>
						<Text>New session</Text>
					</MenubarItem>
					<MenubarItem>
						<Text>Open recent</Text>
					</MenubarItem>
					<MenubarSeparator />
					<MenubarItem>
						<Text>Sign out</Text>
					</MenubarItem>
				</MenubarContent>
			</MenubarMenu>
			<MenubarMenu value="edit">
				<MenubarTrigger>
					<Text>Edit</Text>
				</MenubarTrigger>
				<MenubarContent>
					<MenubarItem>
						<Text>Undo</Text>
					</MenubarItem>
					<MenubarItem>
						<Text>Redo</Text>
					</MenubarItem>
				</MenubarContent>
			</MenubarMenu>
		</Menubar>
	);
}

const meta: Meta<typeof MenubarShowcase> = {
	title: "Components/Menubar",
	component: MenubarShowcase,
	parameters: {
		docs: {
			description: {
				component:
					"Multi-trigger menu bar. Primarily a desktop pattern — included for parity with shadcn ecosystem; mobile chat does not currently use this surface.",
			},
		},
	},
};

export default meta;

type Story = StoryObj<typeof MenubarShowcase>;

export const Default: Story = {};
