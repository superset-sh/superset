import type { Meta, StoryObj } from "@storybook/react-native";
import * as React from "react";
import { View } from "react-native";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const meta = {
	title: "ui/Switch",
	component: Switch,
	args: {
		checked: false,
		onCheckedChange: () => {},
	},
	render: () => {
		const [checked, setChecked] = React.useState(true);
		return (
			<View className="flex-row items-center gap-2">
				<Switch checked={checked} onCheckedChange={setChecked} />
				<Label onPress={() => setChecked((value) => !value)}>
					Airplane Mode
				</Label>
			</View>
		);
	},
} satisfies Meta<typeof Switch>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Checked: Story = {};

export const Unchecked: Story = {
	render: () => <Switch checked={false} onCheckedChange={() => {}} />,
};

export const Disabled: Story = {
	render: () => <Switch checked disabled onCheckedChange={() => {}} />,
};
