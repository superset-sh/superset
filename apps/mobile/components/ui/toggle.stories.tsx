import type { Meta, StoryObj } from "@storybook/react-native";
import { Bold } from "lucide-react-native";
import * as React from "react";
import { Toggle, ToggleIcon } from "@/components/ui/toggle";

const meta = {
	title: "ui/Toggle",
	component: Toggle,
	args: {
		pressed: false,
		onPressedChange: () => {},
	},
	render: () => {
		const [pressed, setPressed] = React.useState(false);
		return (
			<Toggle pressed={pressed} onPressedChange={setPressed} aria-label="Bold">
				<ToggleIcon as={Bold} />
			</Toggle>
		);
	},
} satisfies Meta<typeof Toggle>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Outline: Story = {
	render: () => {
		const [pressed, setPressed] = React.useState(true);
		return (
			<Toggle
				variant="outline"
				pressed={pressed}
				onPressedChange={setPressed}
				aria-label="Bold"
			>
				<ToggleIcon as={Bold} />
			</Toggle>
		);
	},
};
