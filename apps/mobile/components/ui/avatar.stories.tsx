import type { Meta, StoryObj } from "@storybook/react-native";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Text } from "@/components/ui/text";

const meta = {
	title: "ui/Avatar",
	component: Avatar,
	args: {
		alt: "User avatar",
	},
	render: () => (
		<Avatar alt="User avatar" className="size-12">
			<AvatarImage source={{ uri: "https://github.com/shadcn.png" }} />
			<AvatarFallback>
				<Text>CN</Text>
			</AvatarFallback>
		</Avatar>
	),
} satisfies Meta<typeof Avatar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Image: Story = {};

export const Fallback: Story = {
	render: () => (
		<Avatar alt="User avatar" className="size-12">
			<AvatarFallback>
				<Text>JD</Text>
			</AvatarFallback>
		</Avatar>
	),
};
