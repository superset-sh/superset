import type { Meta, StoryObj } from "@storybook/react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";

const meta = {
	title: "ui/Tooltip",
	component: Tooltip,
	render: () => (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button variant="outline">
					<Text>Hover me</Text>
				</Button>
			</TooltipTrigger>
			<TooltipContent>
				<Text>Add to library</Text>
			</TooltipContent>
		</Tooltip>
	),
} satisfies Meta<typeof Tooltip>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
