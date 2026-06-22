import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import {
	Plan,
	PlanAction,
	PlanContent,
	PlanDescription,
	PlanHeader,
	PlanTitle,
	PlanTrigger,
} from "@/components/ai-elements/plan";
import { Text } from "@/components/ui/text";

const meta = {
	title: "ai-elements/Plan",
	component: Plan,
} satisfies Meta<typeof Plan>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
	render: () => (
		<View className="w-full">
			<Plan defaultOpen>
				<PlanHeader>
					<View className="flex-1 gap-1.5">
						<PlanTitle>Migrate the chat screen to LegendList</PlanTitle>
						<PlanDescription>
							Three steps, scoped to the conversation components.
						</PlanDescription>
					</View>
					<PlanAction>
						<PlanTrigger />
					</PlanAction>
				</PlanHeader>
				<PlanContent>
					<View className="gap-2">
						<Text className="text-sm">1. Swap FlatList for LegendList</Text>
						<Text className="text-sm">2. Port the stick-to-bottom hook</Text>
						<Text className="text-sm">3. Verify streaming scroll behavior</Text>
					</View>
				</PlanContent>
			</Plan>
		</View>
	),
};

export const Streaming: Story = {
	render: () => (
		<View className="w-full">
			<Plan isStreaming>
				<PlanHeader>
					<View className="flex-1 gap-1.5">
						<PlanTitle>Drafting migration plan…</PlanTitle>
						<PlanDescription>Analyzing the conversation list…</PlanDescription>
					</View>
					<PlanAction>
						<PlanTrigger />
					</PlanAction>
				</PlanHeader>
			</Plan>
		</View>
	),
};
