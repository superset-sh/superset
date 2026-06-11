import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { SessionsListEmptyNoProjects } from "./SessionsListEmptyNoProjects";

const meta: Meta<typeof SessionsListEmptyNoProjects> = {
	title: "Views/Sessions/01-SessionsList · Empty · no projects",
	component: SessionsListEmptyNoProjects,
	parameters: {
		docs: {
			description: {
				component:
					"UC-NAV-06.1. No projects yet. Header is a plain centered 'Sessions' title; no chip/search/filter/FAB.",
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

type Story = StoryObj<typeof SessionsListEmptyNoProjects>;

export const Default: Story = {};
