import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Text } from "@/components/ui/text";

function HoverCardShowcase() {
	return (
		<HoverCard>
			<HoverCardTrigger>
				<Text className="text-primary underline">@justin</Text>
			</HoverCardTrigger>
			<HoverCardContent className="w-64">
				<View className="gap-1">
					<Text className="font-semibold">Justin Rich</Text>
					<Text variant="small" className="text-muted-foreground">
						Joined March 2025 · 12 active sessions
					</Text>
				</View>
			</HoverCardContent>
		</HoverCard>
	);
}

const meta: Meta<typeof HoverCardShowcase> = {
	title: "Components/HoverCard",
	component: HoverCardShowcase,
	parameters: {
		docs: {
			description: {
				component:
					"Hover/long-press preview card. On mobile, triggers via long-press (no hover). Used for mention preview, link preview. Renders via portal.",
			},
		},
	},
};

export default meta;

type Story = StoryObj<typeof HoverCardShowcase>;

export const Default: Story = {};
