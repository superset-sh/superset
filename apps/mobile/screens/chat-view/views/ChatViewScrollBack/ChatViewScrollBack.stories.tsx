import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { ChatViewScrollBack } from "./ChatViewScrollBack";

const meta: Meta<typeof ChatViewScrollBack> = {
	title: "Views/Chat/02-ChatView · Scroll-back",
	component: ChatViewScrollBack,
	parameters: {
		docs: {
			description: {
				component:
					"UC-RENDER-07 §A — floating scroll-back FAB above the composer. Toggle `scrollBackVisible` to see the Reanimated FadeIn/FadeOut transition; tweak `newMessagesCount` to swap between idle and new-messages variants of ScrollBackButton.",
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
	args: {
		scrollBackVisible: true,
		newMessagesCount: 2,
		onScrollBackPress: () => {},
	},
	argTypes: {
		scrollBackVisible: {
			control: { type: "boolean" },
			description: "Toggle to drive the FadeIn/FadeOut on the floating FAB.",
		},
		newMessagesCount: {
			control: { type: "number", min: 0, max: 99, step: 1 },
			description: "0 hides the badge; ≥1 shows the accent dot.",
		},
	},
};

export default meta;

type Story = StoryObj<typeof ChatViewScrollBack>;

export const WithNewMessages: Story = {};

export const IdleNoBadge: Story = {
	args: { newMessagesCount: 0 },
};

export const Hidden: Story = {
	args: { scrollBackVisible: false },
};
