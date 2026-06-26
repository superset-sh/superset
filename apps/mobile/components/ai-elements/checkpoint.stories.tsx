import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import {
	Checkpoint,
	CheckpointIcon,
	CheckpointTrigger,
} from "@/components/ai-elements/checkpoint";
import { Text } from "@/components/ui/text";

const meta = {
	title: "ai-elements/Checkpoint",
	component: Checkpoint,
} satisfies Meta<typeof Checkpoint>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
	render: () => (
		<View className="w-full">
			<Checkpoint>
				<CheckpointIcon />
				<CheckpointTrigger>
					<Text>Restore checkpoint</Text>
				</CheckpointTrigger>
			</Checkpoint>
		</View>
	),
};

export const WithTooltip: Story = {
	render: () => (
		<View className="w-full">
			<Checkpoint>
				<CheckpointIcon />
				<CheckpointTrigger tooltip="Revert the conversation to this point">
					<Text>Checkpoint at 2:14 PM</Text>
				</CheckpointTrigger>
			</Checkpoint>
		</View>
	),
};
