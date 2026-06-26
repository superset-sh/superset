import type { Meta, StoryObj } from "@storybook/react-native";
import * as React from "react";
import { View } from "react-native";
import {
	type ThinkingLevel,
	ThinkingToggle,
} from "@/components/ai-elements/thinking-toggle";

const InteractiveExample = ({
	initialLevel,
}: {
	initialLevel: ThinkingLevel;
}) => {
	const [level, setLevel] = React.useState<ThinkingLevel>(initialLevel);
	return (
		<View className="flex-row">
			<ThinkingToggle level={level} onLevelChange={setLevel} />
		</View>
	);
};

const meta = {
	title: "ai-elements/ThinkingToggle",
	component: ThinkingToggle,
} satisfies Meta<typeof ThinkingToggle>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Off: Story = {
	args: { level: "off", onLevelChange: () => {} },
	render: () => <InteractiveExample initialLevel="off" />,
};

export const Active: Story = {
	args: { level: "high", onLevelChange: () => {} },
	render: () => <InteractiveExample initialLevel="high" />,
};

export const Max: Story = {
	args: { level: "xhigh", onLevelChange: () => {} },
	render: () => <InteractiveExample initialLevel="xhigh" />,
};
