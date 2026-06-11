import type { Meta, StoryObj } from "@storybook/react-native";
import { MoreVertical } from "lucide-react-native";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

function DropdownMenuShowcase() {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" size="icon">
					<Icon as={MoreVertical} className="size-5" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent>
				<DropdownMenuLabel>
					<Text variant="small" className="text-muted-foreground">
						Session actions
					</Text>
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuItem>
					<Text>Rename</Text>
				</DropdownMenuItem>
				<DropdownMenuItem>
					<Text>End session</Text>
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem>
					<Text className="text-destructive">Delete</Text>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

const meta: Meta<typeof DropdownMenuShowcase> = {
	title: "Components/DropdownMenu",
	component: DropdownMenuShowcase,
	parameters: {
		docs: {
			description: {
				component:
					"Trigger-anchored menu. Used by session overflow `···` (UC-SESS-04 §A). Renders via portal.",
			},
		},
	},
};

export default meta;

type Story = StoryObj<typeof DropdownMenuShowcase>;

export const SessionOverflow: Story = {};
