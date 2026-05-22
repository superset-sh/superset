import type { Meta, StoryObj } from "@storybook/react-native";
import { Pressable, View } from "react-native";
import { Banner } from "@/components/Banner";
import { Text } from "@/components/ui/text";
import { ChatHeader, type ChatHeaderStatus } from "./ChatHeader";

const STATUSES: ChatHeaderStatus[] = ["live", "streaming", "paused", "offline"];

const meta: Meta<typeof ChatHeader> = {
	title: "Organisms/ChatHeader",
	component: ChatHeader,
	parameters: {
		docs: {
			description: {
				component:
					"Chat-view top region. Composes AppHeader with safe-area inset, optional session-status row (StatusDot + label), and an optional banner slot. Every chat view begins with this organism (UC-RENDER-01..07, UC-PAUSE-*, UC-PLATF-03).",
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
		title: "Refactor relay reconnect loop",
		subtitle: "superset · main",
		isScrolled: false,
	},
	argTypes: {
		title: { control: "text" },
		subtitle: { control: "text" },
		status: {
			control: { type: "select" },
			options: ["(none)", ...STATUSES],
			mapping: {
				"(none)": undefined,
				live: "live",
				streaming: "streaming",
				paused: "paused",
				offline: "offline",
			},
			description:
				"Session-status indicator (StatusDot + label) shown above the header",
		},
		statusLabel: { control: "text" },
		isScrolled: { control: "boolean" },
		showBack: { control: "boolean" },
		showActions: { control: "boolean" },
		banner: { control: false },
	},
};

export default meta;

type Story = StoryObj<typeof ChatHeader>;

export const Default: Story = {};

export const Streaming: Story = {
	args: { status: "streaming" },
};

export const Paused: Story = {
	args: { status: "paused", statusLabel: "Awaiting approval" },
};

export const OfflineWithBanner: Story = {
	args: { status: "offline" },
	render: (args) => (
		<ChatHeader
			{...args}
			banner={
				<Banner
					variant="offline"
					headline="Host offline · retry to reconnect"
					cta={
						<Pressable accessibilityRole="button">
							<Text className="text-state-warning-fg font-semibold underline">
								Retry
							</Text>
						</Pressable>
					}
				/>
			}
		/>
	),
};

export const Scrolled: Story = {
	args: { isScrolled: true },
};
