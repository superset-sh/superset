import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { Progress } from "@/components/ui/progress";

const meta = {
	title: "ui/Progress",
	component: Progress,
	args: {
		value: 60,
	},
	argTypes: {
		value: { control: { type: "range", min: 0, max: 100, step: 1 } },
	},
	render: ({ value }) => (
		<View className="w-64">
			<Progress value={value} />
		</View>
	),
} satisfies Meta<typeof Progress>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = { args: { value: 0 } };

export const Full: Story = { args: { value: 100 } };
