import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { Shimmer } from "@/components/ai-elements/shimmer";

const meta = {
	title: "ai-elements/Shimmer",
	component: Shimmer,
	args: {
		children: "Thinking through the problem…",
		duration: 2,
	},
	argTypes: {
		duration: { control: "number" },
	},
	render: ({ children, duration }) => (
		<View className="w-full gap-4">
			<Shimmer duration={duration}>{children}</Shimmer>
			<Shimmer className="text-base" duration={1}>
				Searching the codebase…
			</Shimmer>
		</View>
	),
} satisfies Meta<typeof Shimmer>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
