import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { SessionsListFiltersNoMatch } from "./SessionsListFiltersNoMatch";

const meta: Meta<typeof SessionsListFiltersNoMatch> = {
	title: "Views/Sessions/01-SessionsList · Empty · filters no-match",
	component: SessionsListFiltersNoMatch,
	parameters: {
		docs: {
			description: {
				component:
					"UC-NAV-06.5. Applied filters yield zero matches. Filter button has `·2` badge + AppliedFilterTag row shows 2 filter chips. Body: settings icon + 'No matches' + Clear filters CTA. Tap a chip's ✕ to remove individual filter (useState).",
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
};

export default meta;

type Story = StoryObj<typeof SessionsListFiltersNoMatch>;

export const Default: Story = {};
