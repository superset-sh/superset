import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Text } from "@/components/ui/text";

function PopoverShowcase({
	triggerLabel,
	side,
}: {
	triggerLabel: string;
	side: "top" | "bottom";
}) {
	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button variant="outline">
					<Text>{triggerLabel}</Text>
				</Button>
			</PopoverTrigger>
			<PopoverContent side={side} className="w-64">
				<View className="gap-1">
					<Text className="font-semibold">Model picker</Text>
					<Text variant="small" className="text-muted-foreground">
						Opus 4.7 · Sonnet 4.6 · Haiku 4.5 · GPT-5.5
					</Text>
				</View>
			</PopoverContent>
		</Popover>
	);
}

const meta: Meta<typeof PopoverShowcase> = {
	title: "Components/Popover",
	component: PopoverShowcase,
	parameters: {
		docs: {
			description: {
				component:
					"Anchored floating panel. Base for slash-command-popover (UC-COMP-01 §C), model picker (UC-COMP-04), thinking-level picker (UC-COMP-05). Renders via portal.",
			},
		},
	},
	args: { triggerLabel: "Sonnet 4.6 ▾", side: "top" },
	argTypes: {
		triggerLabel: { control: "text" },
		side: {
			control: { type: "select" },
			options: ["top", "bottom"],
		},
	},
};

export default meta;

type Story = StoryObj<typeof PopoverShowcase>;

export const Default: Story = {};
export const Above: Story = { args: { side: "top" } };
export const Below: Story = { args: { side: "bottom" } };
