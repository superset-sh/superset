import type { Meta, StoryObj } from "@storybook/react-native";
import * as React from "react";
import {
	Menubar,
	MenubarContent,
	MenubarItem,
	MenubarMenu,
	MenubarSeparator,
	MenubarShortcut,
	MenubarTrigger,
} from "@/components/ui/menubar";
import { Text } from "@/components/ui/text";

function MenubarExample() {
	const [value, setValue] = React.useState<string | undefined>(undefined);
	return (
		<Menubar value={value} onValueChange={setValue}>
			<MenubarMenu value="file">
				<MenubarTrigger>
					<Text>File</Text>
				</MenubarTrigger>
				<MenubarContent>
					<MenubarItem>
						<Text>New Tab</Text>
						<MenubarShortcut>⌘T</MenubarShortcut>
					</MenubarItem>
					<MenubarItem>
						<Text>New Window</Text>
					</MenubarItem>
					<MenubarSeparator />
					<MenubarItem>
						<Text>Print</Text>
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

const meta = {
	title: "ui/Menubar",
	component: Menubar,
	args: {
		value: undefined,
		onValueChange: () => {},
	},
	render: () => <MenubarExample />,
} satisfies Meta<typeof Menubar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
