import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { ChatViewHostOffline } from "./ChatViewHostOffline";

const meta: Meta<typeof ChatViewHostOffline> = {
	title: "Views/Chat/02-ChatView · Host offline banner",
	component: ChatViewHostOffline,
	parameters: {
		docs: {
			description: {
				component:
					"UC-PLATF-03 §A — host-offline banner above the thread. Composer stays visible but disabled. Tap Retry to wire `onRetry`.",
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
	args: { onRetry: () => {} },
};

export default meta;

type Story = StoryObj<typeof ChatViewHostOffline>;

export const Default: Story = {};
