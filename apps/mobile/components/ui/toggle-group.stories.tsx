import type { Meta, StoryObj } from "@storybook/react-native";
import { Bold, Italic, Underline } from "lucide-react-native";
import * as React from "react";
import {
	ToggleGroup,
	ToggleGroupIcon,
	ToggleGroupItem,
} from "@/components/ui/toggle-group";

const meta = {
	title: "ui/ToggleGroup",
	component: ToggleGroup,
	args: {
		type: "multiple",
		value: ["bold"],
		onValueChange: () => {},
	},
	render: () => {
		const [value, setValue] = React.useState<string[]>(["bold"]);
		return (
			<ToggleGroup
				type="multiple"
				variant="outline"
				value={value}
				onValueChange={setValue}
			>
				<ToggleGroupItem value="bold" isFirst aria-label="Bold">
					<ToggleGroupIcon as={Bold} />
				</ToggleGroupItem>
				<ToggleGroupItem value="italic" aria-label="Italic">
					<ToggleGroupIcon as={Italic} />
				</ToggleGroupItem>
				<ToggleGroupItem value="underline" isLast aria-label="Underline">
					<ToggleGroupIcon as={Underline} />
				</ToggleGroupItem>
			</ToggleGroup>
		);
	},
} satisfies Meta<typeof ToggleGroup>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Multiple: Story = {};

export const Single: Story = {
	render: () => {
		const [value, setValue] = React.useState<string | undefined>("center");
		return (
			<ToggleGroup type="single" value={value} onValueChange={setValue}>
				<ToggleGroupItem value="left" isFirst aria-label="Left">
					<ToggleGroupIcon as={Bold} />
				</ToggleGroupItem>
				<ToggleGroupItem value="center" aria-label="Center">
					<ToggleGroupIcon as={Italic} />
				</ToggleGroupItem>
				<ToggleGroupItem value="right" isLast aria-label="Right">
					<ToggleGroupIcon as={Underline} />
				</ToggleGroupItem>
			</ToggleGroup>
		);
	},
};
