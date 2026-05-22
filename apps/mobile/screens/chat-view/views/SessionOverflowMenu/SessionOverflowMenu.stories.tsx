import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { SessionOverflowMenu } from "./SessionOverflowMenu";

const meta: Meta<typeof SessionOverflowMenu> = {
	title: "Views/Shared/Session overflow sheet",
	component: SessionOverflowMenu,
	parameters: {
		docs: {
			description: {
				component:
					"UC-SESS-04 §A — session overflow bottom sheet over a dimmed chat. Three actions: Rename · End session · Delete (destructive). Drag handle / backdrop tap to dismiss.",
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
	args: { autoPresent: true, onAction: () => {} },
	argTypes: {
		autoPresent: { control: "boolean" },
	},
};

export default meta;

type Story = StoryObj<typeof SessionOverflowMenu>;

export const Default: Story = {};
