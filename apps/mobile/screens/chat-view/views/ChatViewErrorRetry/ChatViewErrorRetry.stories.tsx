import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { ChatViewErrorRetry } from "./ChatViewErrorRetry";

const meta: Meta<typeof ChatViewErrorRetry> = {
	title: "Views/Chat/02-ChatView · Error + Retry",
	component: ChatViewErrorRetry,
	parameters: {
		docs: {
			description: {
				component:
					"UC-SESS-02 §B — host returned an error fetching session history. Dispatch-failed banner under the header + centered Retry CTA; composer is hidden until the snapshot resolves.",
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

type Story = StoryObj<typeof ChatViewErrorRetry>;

export const Default: Story = {};
