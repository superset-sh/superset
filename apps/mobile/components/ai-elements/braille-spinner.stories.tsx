import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { BrailleSpinner } from "@/components/ai-elements/braille-spinner";
import { Text } from "@/components/ui/text";

const meta = {
	title: "ai-elements/BrailleSpinner",
	component: BrailleSpinner,
} satisfies Meta<typeof BrailleSpinner>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Animating: Story = {};

export const CustomColor: Story = {
	args: {
		className: "text-primary",
	},
};

export const InlineWithLabel: Story = {
	render: () => (
		<View className="flex-row items-center gap-2">
			<BrailleSpinner />
			<Text className="text-muted-foreground text-sm">Running command…</Text>
		</View>
	),
};
