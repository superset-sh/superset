import type { Meta, StoryObj } from "@storybook/react-native";
import * as React from "react";
import { View } from "react-native";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

const meta = {
	title: "ui/Checkbox",
	component: Checkbox,
	args: {
		checked: false,
		onCheckedChange: () => {},
	},
	render: () => {
		const [checked, setChecked] = React.useState(true);
		return (
			<View className="flex-row items-center gap-2">
				<Checkbox checked={checked} onCheckedChange={setChecked} />
				<Label onPress={() => setChecked((value) => !value)}>
					Accept terms and conditions
				</Label>
			</View>
		);
	},
} satisfies Meta<typeof Checkbox>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Checked: Story = {};

export const Unchecked: Story = {
	render: () => <Checkbox checked={false} onCheckedChange={() => {}} />,
};

export const Disabled: Story = {
	render: () => <Checkbox checked disabled onCheckedChange={() => {}} />,
};
