import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { Loader } from "@/components/ai-elements/loader";

const meta = {
	title: "ai-elements/Loader",
	component: Loader,
} satisfies Meta<typeof Loader>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Sizes: Story = {
	render: () => (
		<View className="flex-row items-center gap-4">
			<Loader size={16} />
			<Loader size={24} />
			<Loader size={32} />
		</View>
	),
};
