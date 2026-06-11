import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { NewChatSheetView } from "./NewChatSheetView";

const meta: Meta<typeof NewChatSheetView> = {
	title: "Views/Sessions/01-SessionsList · New chat sheet",
	component: NewChatSheetView,
	parameters: {
		docs: {
			description: {
				component:
					"UC-NAV §D — new-chat workspace picker bottom sheet over dimmed sessions list. 5 workspace rows with branch · host metadata + sessions count + last-active time. Empty workspace shows 'no sessions yet'.",
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

type Story = StoryObj<typeof NewChatSheetView>;

export const Default: Story = {};
