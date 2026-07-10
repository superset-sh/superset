import type { Meta, StoryObj } from "@storybook/react-native";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Text } from "@/components/ui/text";

const meta = {
	title: "ui/DropdownMenu",
	component: DropdownMenu,
	render: () => (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="outline">
					<Text>Open menu</Text>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent className="w-48">
				<DropdownMenuLabel>
					<Text>My Account</Text>
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuItem>
					<Text>Profile</Text>
				</DropdownMenuItem>
				<DropdownMenuItem>
					<Text>Billing</Text>
				</DropdownMenuItem>
				<DropdownMenuItem variant="destructive">
					<Text>Log out</Text>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	),
} satisfies Meta<typeof DropdownMenu>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
