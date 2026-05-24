import type { Meta, StoryObj } from "@storybook/react-native";
import { ScrollView, View } from "react-native";
import { SessionsListCombinedEmpty } from "./SessionsListCombinedEmpty";

const meta: Meta<typeof SessionsListCombinedEmpty> = {
	title: "Views/Sessions/01-SessionsList · Empty · contact sheet",
	component: SessionsListCombinedEmpty,
	parameters: {
		docs: {
			description: {
				component:
					"Reference contact sheet — all 5 empty variants stacked for side-by-side review. Scrollable.",
			},
		},
		layout: "fullscreen",
	},
	decorators: [
		(Story) => (
			<ScrollView className="flex-1 bg-background">
				<View>
					<Story />
				</View>
			</ScrollView>
		),
	],
};

export default meta;

type Story = StoryObj<typeof SessionsListCombinedEmpty>;

export const AllVariants: Story = {};
