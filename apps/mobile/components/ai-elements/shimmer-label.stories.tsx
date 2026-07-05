import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { ShimmerLabel } from "@/components/ai-elements/shimmer-label";

const meta = {
	title: "ai-elements/ShimmerLabel",
	component: ShimmerLabel,
} satisfies Meta<typeof ShimmerLabel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Shimmering: Story = {
	args: {
		children: "Thinking",
	},
	render: (args) => (
		<View className="w-full gap-4">
			<ShimmerLabel {...args} />
			<ShimmerLabel duration={1}>Searching the codebase</ShimmerLabel>
		</View>
	),
};

export const Static: Story = {
	args: {
		children: "Thought for 12s",
		isShimmering: false,
	},
};
