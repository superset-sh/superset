import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { Separator } from "@/components/ui/separator";
import { Text } from "@/components/ui/text";

function SeparatorShowcase({
	orientation,
}: {
	orientation: "horizontal" | "vertical";
}) {
	if (orientation === "vertical") {
		return (
			<View className="flex-row items-center gap-3 h-8">
				<Text variant="small">Left</Text>
				<Separator orientation="vertical" />
				<Text variant="small">Right</Text>
			</View>
		);
	}
	return (
		<View className="w-full gap-2">
			<Text variant="small">Above the line</Text>
			<Separator orientation="horizontal" />
			<Text variant="small" className="text-muted-foreground">
				Below the line
			</Text>
		</View>
	);
}

const meta: Meta<typeof SeparatorShowcase> = {
	title: "Components/Separator",
	component: SeparatorShowcase,
	parameters: {
		docs: {
			description: {
				component:
					"Hairline divider — 1px line using --color-border. Horizontal (default) or vertical. Used in popovers, message gaps, sheet sections.",
			},
		},
	},
	args: {
		orientation: "horizontal",
	},
	argTypes: {
		orientation: {
			control: { type: "select" },
			options: ["horizontal", "vertical"],
		},
	},
};

export default meta;

type Story = StoryObj<typeof SeparatorShowcase>;

export const Horizontal: Story = {};
export const Vertical: Story = { args: { orientation: "vertical" } };
