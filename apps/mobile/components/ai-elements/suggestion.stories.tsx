import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";

const SUGGESTIONS = [
	"Explain the scroll behavior",
	"Add pull-to-refresh",
	"Show me the diff",
	"Write release notes",
	"Profile list performance",
];

const meta = {
	title: "ai-elements/Suggestion",
	component: Suggestion,
	args: {
		suggestion: SUGGESTIONS[0],
	},
} satisfies Meta<typeof Suggestion>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Row: Story = {
	render: () => (
		<View className="w-full">
			<Suggestions>
				{SUGGESTIONS.map((suggestion) => (
					<Suggestion
						key={suggestion}
						onPress={(value) => console.log(value)}
						suggestion={suggestion}
					/>
				))}
			</Suggestions>
		</View>
	),
};

export const Single: Story = {
	render: (args) => (
		<View className="w-full items-start">
			<Suggestion {...args} />
		</View>
	),
};
