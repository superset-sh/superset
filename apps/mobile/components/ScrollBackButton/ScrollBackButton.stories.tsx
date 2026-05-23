import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { ScrollBackButton } from "./ScrollBackButton";

const meta: Meta<typeof ScrollBackButton> = {
	title: "Molecules/ScrollBackButton",
	component: ScrollBackButton,
	parameters: {
		docs: {
			description: {
				component:
					"Floating scroll-back button (UC-RENDER-07). Appears when user scrolls away from latest message; tap returns to bottom. 2 variants — idle (bare chevron) · new-messages (accent dot at top-right). FadeIn/Out via Reanimated when `visible` toggles. 56pt FAB diameter satisfies 44pt touch target. Composes FabBase + StatusDot + Animated.View.",
			},
		},
		layout: "centered",
	},
	args: {
		visible: true,
		newMessagesCount: 0,
	},
	argTypes: {
		visible: {
			control: "boolean",
			description: "FadeIn/Out toggle (200ms)",
		},
		newMessagesCount: {
			control: { type: "number", min: 0, max: 99 },
			description: "When > 0 renders accent dot at top-right",
		},
	},
};

export default meta;

type Story = StoryObj<typeof ScrollBackButton>;

export const Idle: Story = {};

export const WithNewMessages: Story = {
	args: { newMessagesCount: 3 },
};

export const Hidden: Story = {
	args: { visible: false },
};

export const InScrollContextOverlay: Story = {
	render: () => (
		<View className="relative w-full max-w-sm h-64 bg-background border border-border rounded-lg overflow-hidden">
			<View className="absolute bottom-3 right-3">
				<ScrollBackButton newMessagesCount={2} />
			</View>
		</View>
	),
};
