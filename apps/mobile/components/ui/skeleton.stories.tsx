import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { Skeleton } from "@/components/ui/skeleton";

const meta = {
	title: "ui/Skeleton",
	component: Skeleton,
	render: () => (
		<View className="flex-row items-center gap-3">
			<Skeleton className="size-12 rounded-full" />
			<View className="gap-2">
				<Skeleton className="h-4 w-40" />
				<Skeleton className="h-4 w-28" />
			</View>
		</View>
	),
} satisfies Meta<typeof Skeleton>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
