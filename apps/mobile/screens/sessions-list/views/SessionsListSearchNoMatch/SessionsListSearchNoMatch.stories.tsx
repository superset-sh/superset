import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { SessionsListSearchNoMatch } from "./SessionsListSearchNoMatch";

const meta: Meta<typeof SessionsListSearchNoMatch> = {
	title: "Views/Sessions/01-SessionsList · Empty · search no-match",
	component: SessionsListSearchNoMatch,
	parameters: {
		docs: {
			description: {
				component:
					"UC-NAV-06.4. Active search query yields zero matches. Multi-project chip + populated search input + visible clear button. Body: search icon + 'No matches' + Clear search CTA. No FAB.",
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
	args: { initialQuery: "zzzz" },
	argTypes: { initialQuery: { control: "text" } },
};

export default meta;

type Story = StoryObj<typeof SessionsListSearchNoMatch>;

export const Default: Story = {};
