import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Text } from "@/components/ui/text";

const meta = {
	title: "ui/AspectRatio",
	component: AspectRatio,
	render: ({ ratio }) => (
		<View className="w-64">
			<AspectRatio ratio={ratio}>
				<View className="bg-muted size-full items-center justify-center rounded-md">
					<Text className="text-muted-foreground">{ratio} ratio</Text>
				</View>
			</AspectRatio>
		</View>
	),
} satisfies Meta<typeof AspectRatio>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Widescreen: Story = { args: { ratio: 16 / 9 } };

export const Square: Story = { args: { ratio: 1 } };

export const Portrait: Story = { args: { ratio: 3 / 4 } };
