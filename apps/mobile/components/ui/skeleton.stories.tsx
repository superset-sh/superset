import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { Skeleton } from "@/components/ui/skeleton";

function SkeletonShowcase({
	pattern,
}: {
	pattern: "single" | "message-list" | "row";
}) {
	if (pattern === "single") {
		return <Skeleton className="h-6 w-48" />;
	}
	if (pattern === "row") {
		return (
			<View className="flex-row items-center gap-3 w-full">
				<Skeleton className="size-10 rounded-full" />
				<View className="flex-1 gap-2">
					<Skeleton className="h-4 w-3/4" />
					<Skeleton className="h-3 w-1/2" />
				</View>
			</View>
		);
	}
	return (
		<View className="gap-4 w-full">
			<View className="self-end gap-2 items-end w-full">
				<Skeleton className="h-12 w-3/5 rounded-2xl" />
			</View>
			<View className="gap-2 w-full">
				<Skeleton className="h-3 w-full" />
				<Skeleton className="h-3 w-4/5" />
				<Skeleton className="h-3 w-3/4" />
			</View>
			<View className="self-end items-end w-full">
				<Skeleton className="h-10 w-2/5 rounded-2xl" />
			</View>
			<View className="gap-2 w-full">
				<Skeleton className="h-3 w-full" />
				<Skeleton className="h-3 w-2/3" />
			</View>
		</View>
	);
}

const meta: Meta<typeof SkeletonShowcase> = {
	title: "Components/Skeleton",
	component: SkeletonShowcase,
	parameters: {
		docs: {
			description: {
				component:
					"Loading placeholder with pulsing opacity (Reanimated). Used during chat history fetch (UC-SESS-02 §A), avatar load, and any deferred content.",
			},
		},
	},
	args: {
		pattern: "single",
	},
	argTypes: {
		pattern: {
			control: { type: "select" },
			options: ["single", "row", "message-list"],
		},
	},
};

export default meta;

type Story = StoryObj<typeof SkeletonShowcase>;

export const SingleBar: Story = { args: { pattern: "single" } };
export const RowWithAvatar: Story = { args: { pattern: "row" } };
export const ChatHistoryLoading: Story = {
	args: { pattern: "message-list" },
	parameters: {
		docs: {
			description: {
				story:
					"Skeleton variant for UC-SESS-02 §A — alternating bubble shapes mimicking user/assistant pattern.",
			},
		},
	},
};
