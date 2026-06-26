import type { Meta, StoryObj } from "@storybook/react-native";
import { Heart, Star } from "lucide-react-native";
import { View } from "react-native";
import { Icon } from "@/components/ui/icon";

const meta = {
	title: "ui/Icon",
	component: Icon,
	args: {
		as: Star,
	},
	render: () => (
		<View className="flex-row items-center gap-4">
			<Icon as={Star} className="size-6" />
			<Icon as={Heart} className="text-destructive size-8" />
			<Icon as={Star} className="text-primary size-10" />
		</View>
	),
} satisfies Meta<typeof Icon>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
