import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { UserMessageBubble } from "./UserMessageBubble";

const meta: Meta<typeof UserMessageBubble> = {
	title: "Molecules/UserMessageBubble",
	component: UserMessageBubble,
	parameters: {
		docs: {
			description: {
				component:
					"User's outgoing message — right-aligned bubble with styled surface. 3 variants — default · accent (@mentions ember) · pending (optimistic 60% opacity). failed=true swaps timestamp for 'Failed to send' + Retry Button. Long-press opens copy/share via onLongPress. Composes Pressable + Button + Text.",
			},
		},
		layout: "fullscreen",
	},
	args: {
		message: "The relay tunnel is reconnecting on every Wi-Fi flap.",
		timestamp: "12:42 PM",
		variant: "default",
		failed: false,
	},
	argTypes: {
		message: { control: "text" },
		timestamp: { control: "text" },
		variant: {
			control: { type: "select" },
			options: ["default", "accent", "pending"],
		},
		failed: { control: "boolean" },
	},
};

export default meta;

type Story = StoryObj<typeof UserMessageBubble>;

export const Default: Story = {};

export const Accent: Story = {
	args: { variant: "accent", message: "@assistant please check this out" },
};

export const Pending: Story = {
	args: { variant: "pending", timestamp: undefined },
};

export const Failed: Story = {
	args: { failed: true, timestamp: undefined },
};

export const InThread: Story = {
	render: () => (
		<View className="gap-2 max-w-sm w-full p-4">
			<UserMessageBubble
				message="Hey, can you look at the auth flow?"
				timestamp="12:40 PM"
			/>
			<UserMessageBubble
				message="@assistant focus on the JWT refresh path"
				variant="accent"
				timestamp="12:41 PM"
			/>
			<UserMessageBubble
				message="The relay tunnel is reconnecting on every Wi-Fi flap. Can you find where we set the backoff and increase it?"
				timestamp="12:42 PM"
			/>
		</View>
	),
};
