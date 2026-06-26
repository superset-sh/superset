import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const meta = {
	title: "ui/Label",
	component: Label,
	render: () => (
		<View className="w-64 gap-1.5">
			<Label>Email</Label>
			<Input placeholder="hello@example.com" />
		</View>
	),
} satisfies Meta<typeof Label>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Disabled: Story = {
	render: () => <Label disabled>Disabled label</Label>,
};
