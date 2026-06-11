import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { Separator } from "@/components/ui/separator";
import { Text } from "@/components/ui/text";

const meta = {
	title: "ui/Separator",
	component: Separator,
	render: () => (
		<View className="w-64 gap-3">
			<Text>Above the separator</Text>
			<Separator />
			<Text>Below the separator</Text>
		</View>
	),
} satisfies Meta<typeof Separator>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Horizontal: Story = {};

export const Vertical: Story = {
	render: () => (
		<View className="h-8 flex-row items-center gap-3">
			<Text>Left</Text>
			<Separator orientation="vertical" />
			<Text>Right</Text>
		</View>
	),
};
