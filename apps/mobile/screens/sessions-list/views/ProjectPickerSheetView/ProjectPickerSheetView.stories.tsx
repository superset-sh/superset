import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { ProjectPickerSheetView } from "./ProjectPickerSheetView";

const meta: Meta<typeof ProjectPickerSheetView> = {
	title: "Views/Sessions/01-SessionsList · Project picker sheet",
	component: ProjectPickerSheetView,
	parameters: {
		docs: {
			description: {
				component:
					"UC-NAV §B — project picker bottom sheet over a dimmed SessionsList. 3 project rows with workspace + session counts. Tap a row to select (useState).",
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
	args: { autoPresent: true },
	argTypes: { autoPresent: { control: "boolean" } },
};

export default meta;

type Story = StoryObj<typeof ProjectPickerSheetView>;

export const Default: Story = {};
