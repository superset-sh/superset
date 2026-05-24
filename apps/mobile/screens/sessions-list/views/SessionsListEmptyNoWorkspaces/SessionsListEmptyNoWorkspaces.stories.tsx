import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { SessionsListEmptyNoWorkspaces } from "./SessionsListEmptyNoWorkspaces";

const meta: Meta<typeof SessionsListEmptyNoWorkspaces> = {
	title: "Views/Sessions/01-SessionsList · Empty · no workspaces",
	component: SessionsListEmptyNoWorkspaces,
	parameters: {
		docs: {
			description: {
				component:
					"UC-NAV-06.2. Exactly one project but zero workspaces. Header uses single-project chip variant (no chevron). No FAB.",
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

type Story = StoryObj<typeof SessionsListEmptyNoWorkspaces>;

export const Default: Story = {};
