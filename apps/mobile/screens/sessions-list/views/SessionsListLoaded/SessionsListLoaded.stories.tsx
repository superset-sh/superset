import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { SessionsListLoaded } from "./SessionsListLoaded";

const meta: Meta<typeof SessionsListLoaded> = {
	title: "Views/Sessions/01-SessionsList · Loaded (canonical)",
	component: SessionsListLoaded,
	parameters: {
		docs: {
			description: {
				component:
					"UC-NAV §A canonical. Project-first chrome: ProjectChipHeader (multi-project) with hamburger + project chip + search + filter. FlatList of 5 SessionRow showing the full status spectrum. NewChatFab anchored bottom-right.",
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
	args: { filterCount: 0 },
	argTypes: {
		filterCount: { control: { type: "number", min: 0, max: 9 } },
	},
};

export default meta;

type Story = StoryObj<typeof SessionsListLoaded>;

export const Default: Story = {};

export const WithFilterBadge: Story = {
	args: {
		filterCount: 2,
		appliedFilters: [
			{ id: "f1", kind: "workspace", label: "main · desktop" },
			{ id: "f2", kind: "status", label: "Streaming" },
		],
	},
};
