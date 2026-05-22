import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { ToolStatusRule } from "./ToolStatusRule";

function ToolStatusRuleShowcase({
	variant,
	thickness,
}: {
	variant: "running" | "completed" | "failed" | "pending" | "neutral" | "ember";
	thickness: number;
}) {
	return (
		<View className="flex-row items-stretch w-full max-w-sm h-20 bg-card border-border rounded-md border overflow-hidden">
			<ToolStatusRule variant={variant} thickness={thickness} />
			<View className="flex-1 p-3 gap-1">
				<Text className="font-semibold">ReadFile</Text>
				<Text variant="small" className="text-muted-foreground">
					src/handlers/chat.ts · 1.2KB · variant={variant}
				</Text>
			</View>
		</View>
	);
}

const meta: Meta<typeof ToolStatusRuleShowcase> = {
	title: "Components/ToolStatusRule",
	component: ToolStatusRuleShowcase,
	parameters: {
		docs: {
			description: {
				component:
					"Vertical colored rule on the left edge of tool-call cards (UC-RENDER-04) and pending-approval cards (UC-PAUSE-01). Variant colors map to state palette + ember.",
			},
		},
	},
	args: {
		variant: "running",
		thickness: 3,
	},
	argTypes: {
		variant: {
			control: { type: "select" },
			options: [
				"running",
				"completed",
				"failed",
				"pending",
				"neutral",
				"ember",
			],
		},
		thickness: { control: { type: "range", min: 1, max: 8, step: 1 } },
	},
};

export default meta;

type Story = StoryObj<typeof ToolStatusRuleShowcase>;

export const Running: Story = {};
export const Completed: Story = { args: { variant: "completed" } };
export const Failed: Story = { args: { variant: "failed" } };
export const Pending: Story = { args: { variant: "pending" } };
export const Neutral: Story = { args: { variant: "neutral" } };
export const Ember: Story = { args: { variant: "ember" } };

export const AllVariants: Story = {
	render: () => (
		<View className="gap-2 w-full max-w-sm">
			{(
				[
					"running",
					"completed",
					"failed",
					"pending",
					"neutral",
					"ember",
				] as const
			).map((v) => (
				<View
					key={v}
					className="flex-row items-stretch h-12 bg-card border-border rounded-md border overflow-hidden"
				>
					<ToolStatusRule variant={v} />
					<View className="flex-1 px-3 justify-center">
						<Text variant="small">{v}</Text>
					</View>
				</View>
			))}
		</View>
	),
};
