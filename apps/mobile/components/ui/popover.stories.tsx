import type { Meta, StoryObj } from "@storybook/react-native";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Text } from "@/components/ui/text";

const meta = {
	title: "ui/Popover",
	component: Popover,
	render: () => (
		<Popover>
			<PopoverTrigger asChild>
				<Button variant="outline">
					<Text>Open popover</Text>
				</Button>
			</PopoverTrigger>
			<PopoverContent>
				<Text variant="large">Dimensions</Text>
				<Text className="text-muted-foreground mt-2">
					Set the dimensions for the layer.
				</Text>
			</PopoverContent>
		</Popover>
	),
} satisfies Meta<typeof Popover>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
