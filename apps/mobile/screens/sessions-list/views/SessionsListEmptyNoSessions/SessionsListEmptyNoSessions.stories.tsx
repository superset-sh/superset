import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { SessionsListEmptyNoSessions } from "./SessionsListEmptyNoSessions";

const meta: Meta<typeof SessionsListEmptyNoSessions> = {
	title: "Views/Sessions/01-SessionsList · Empty · no sessions",
	component: SessionsListEmptyNoSessions,
	parameters: {
		docs: {
			description: {
				component:
					"UC-NAV-06.3. Multi-project, current project has zero sessions. Multi-project chip header. FAB IS visible — only empty state where the user can create a session.",
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

type Story = StoryObj<typeof SessionsListEmptyNoSessions>;

export const Default: Story = {};
