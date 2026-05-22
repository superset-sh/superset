import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { ChatViewLoading } from "./ChatViewLoading";

const meta: Meta<typeof ChatViewLoading> = {
	title: "Views/Chat/02-ChatView · Loading history",
	component: ChatViewLoading,
	parameters: {
		docs: {
			description: {
				component:
					"UC-SESS-02 §A — chat view while history is being fetched. Header renders normally, body is replaced by the LoadingSkeleton organism, composer is disabled. `density` control flips between sparse (3 messages) and dense (6 messages).",
			},
		},
		layout: "fullscreen",
	},
	decorators: [
		(Story) => (
			<View className="flex-1 bg-background">
				<Story />
			</View>
		),
	],
	args: { density: "sparse" },
	argTypes: {
		density: {
			control: { type: "select" },
			options: ["sparse", "dense"],
			description: "Skeleton density. Sparse = 3 messages, dense = 6.",
		},
	},
};

export default meta;

type Story = StoryObj<typeof ChatViewLoading>;

export const Sparse: Story = {};

export const Dense: Story = {
	args: { density: "dense" },
};
