import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { SessionFilterSheetView } from "./SessionFilterSheetView";

const meta: Meta<typeof SessionFilterSheetView> = {
	title: "Views/Sessions/01-SessionsList · Filter sheet",
	component: SessionFilterSheetView,
	parameters: {
		docs: {
			description: {
				component:
					"UC-NAV-08 §C — full filter sheet (85vh) over dimmed sessions list. 5 workspace rows + 3 status rows multi-select + Clear all / Apply footer. Tap Apply to commit filters (useState).",
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

type Story = StoryObj<typeof SessionFilterSheetView>;

export const Default: Story = {};
