import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { ToolStatusRule } from "./ToolStatusRule";

type Variant = "running" | "done" | "pending" | "error" | "neutral";

function ToolStatusRuleShowcase({
	variant,
	orientation,
}: {
	variant: Variant;
	orientation: "vertical" | "horizontal";
}) {
	if (orientation === "horizontal") {
		return (
			<View className="w-full max-w-sm bg-card border-border rounded-md border overflow-hidden">
				<ToolStatusRule variant={variant} orientation="horizontal" />
				<View className="p-3 gap-1">
					<Text className="font-semibold">approval-footer</Text>
					<Text variant="small" className="text-muted-foreground">
						horizontal rule · variant={variant}
					</Text>
				</View>
			</View>
		);
	}
	return (
		<View className="flex-row items-stretch w-full max-w-sm h-20 bg-card border-border rounded-md border overflow-hidden">
			<ToolStatusRule variant={variant} orientation="vertical" />
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
					"3px colored rule indicating tool-call / approval status. Five status variants (running · done · pending · error · neutral) × two orientations (vertical default · horizontal for approval-footer). `running` and `pending` carry a soft glow via boxShadow.",
			},
		},
	},
	args: {
		variant: "running",
		orientation: "vertical",
	},
	argTypes: {
		variant: {
			control: { type: "select" },
			options: ["running", "done", "pending", "error", "neutral"],
			description:
				"Status palette — running (mint + glow) · done (green) · pending (amber + glow) · error (red) · neutral (gray)",
		},
		orientation: {
			control: { type: "select" },
			options: ["vertical", "horizontal"],
			description:
				"vertical (default, left-edge of tool-call cards) or horizontal (top-edge of approval-footer)",
		},
	},
};

export default meta;

type Story = StoryObj<typeof ToolStatusRuleShowcase>;

export const Running: Story = {};
export const Done: Story = { args: { variant: "done" } };
export const Pending: Story = { args: { variant: "pending" } };
export const ErrorVariant: Story = { args: { variant: "error" } };
export const Neutral: Story = { args: { variant: "neutral" } };

export const HorizontalRunning: Story = {
	args: { orientation: "horizontal", variant: "running" },
};

export const AllVariantsVertical: Story = {
	render: () => (
		<View className="gap-2 w-full max-w-sm p-2">
			{(["running", "done", "pending", "error", "neutral"] as const).map(
				(v) => (
					<View
						key={v}
						className="flex-row items-stretch h-12 bg-card border-border rounded-md border overflow-hidden"
					>
						<ToolStatusRule variant={v} />
						<View className="flex-1 px-3 justify-center">
							<Text variant="small">{v}</Text>
						</View>
					</View>
				),
			)}
		</View>
	),
};

export const AllVariantsHorizontal: Story = {
	render: () => (
		<View className="gap-2 w-full max-w-sm p-2">
			{(["running", "done", "pending", "error", "neutral"] as const).map(
				(v) => (
					<View
						key={v}
						className="bg-card border-border rounded-md border overflow-hidden"
					>
						<ToolStatusRule variant={v} orientation="horizontal" />
						<View className="px-3 py-2">
							<Text variant="small">{v}</Text>
						</View>
					</View>
				),
			)}
		</View>
	),
};
