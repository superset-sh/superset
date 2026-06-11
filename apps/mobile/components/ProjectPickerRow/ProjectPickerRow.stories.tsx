import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { ProjectPickerRow } from "./ProjectPickerRow";

const meta: Meta<typeof ProjectPickerRow> = {
	title: "Molecules/Sessions/ProjectPickerRow",
	component: ProjectPickerRow,
	parameters: {
		docs: {
			description: {
				component:
					"Row in the ProjectPickerSheet (UC-NAV §B). Package icon + name + meta subtitle + trailing check when selected. Selected row also tints `bg-accent`.",
			},
		},
	},
	decorators: [
		(Story) => (
			<View className="flex-1 bg-background">
				<Story />
			</View>
		),
	],
	args: {
		name: "superset",
		subtitle: "4 workspaces · 12 sessions",
		selected: false,
		onPress: () => {},
	},
	argTypes: {
		name: { control: "text" },
		subtitle: { control: "text" },
		selected: { control: "boolean" },
	},
};

export default meta;

type Story = StoryObj<typeof ProjectPickerRow>;

export const Unselected: Story = {};

export const Selected: Story = {
	args: { selected: true },
};

export const NoSessionsYet: Story = {
	args: {
		name: "LaneShadow",
		subtitle: "2 workspaces · no sessions yet",
	},
};
