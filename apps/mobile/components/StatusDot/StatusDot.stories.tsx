import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { StatusDot } from "./StatusDot";

const meta: Meta<typeof StatusDot> = {
	title: "Components/StatusDot",
	component: StatusDot,
	parameters: {
		docs: {
			description: {
				component:
					"Single colored circle for status indicators. Variants from the state palette (live/warning/danger/success/neutral) + ember for brand emphasis. Composable into session rows and inline status badges.",
			},
		},
	},
	args: {
		variant: "live",
		size: "md",
		accessibilityLabel: "Streaming",
	},
	argTypes: {
		variant: {
			control: { type: "select" },
			options: ["live", "warning", "danger", "success", "neutral", "ember"],
		},
		size: {
			control: { type: "select" },
			options: ["sm", "md", "lg"],
		},
		accessibilityLabel: { control: "text" },
	},
};

export default meta;

type Story = StoryObj<typeof StatusDot>;

export const Live: Story = {};
export const Warning: Story = {
	args: { variant: "warning", accessibilityLabel: "Pause pending" },
};
export const Danger: Story = {
	args: { variant: "danger", accessibilityLabel: "Host offline" },
};
export const Success: Story = {
	args: { variant: "success", accessibilityLabel: "Complete" },
};
export const Neutral: Story = {
	args: { variant: "neutral", accessibilityLabel: "Idle" },
};
export const Ember: Story = {
	args: { variant: "ember", accessibilityLabel: "New" },
};

export const InSessionRow: Story = {
	render: () => (
		<View className="gap-2">
			<View className="flex-row items-center gap-2">
				<StatusDot variant="live" accessibilityLabel="Streaming" />
				<Text className="font-medium">Refactor relay tunnel</Text>
				<Text variant="muted" className="text-xs">
					· main · macbook-pro · 2m
				</Text>
			</View>
			<View className="flex-row items-center gap-2">
				<StatusDot variant="warning" accessibilityLabel="Pause pending" />
				<Text className="font-medium">Migrate auth flow</Text>
				<Text variant="muted" className="text-xs">
					· feat-auth · macbook-pro · 5m
				</Text>
			</View>
			<View className="flex-row items-center gap-2">
				<StatusDot variant="neutral" accessibilityLabel="Idle" />
				<Text className="font-medium">Doc cleanup</Text>
				<Text variant="muted" className="text-xs">
					· main · server · 3h
				</Text>
			</View>
		</View>
	),
};

export const AllVariantsAllSizes: Story = {
	render: () => (
		<View className="gap-3">
			{(
				["live", "warning", "danger", "success", "neutral", "ember"] as const
			).map((v) => (
				<View key={v} className="flex-row items-center gap-3">
					<View className="w-20">
						<Text variant="small" className="text-muted-foreground">
							{v}
						</Text>
					</View>
					<StatusDot variant={v} size="sm" />
					<StatusDot variant={v} size="md" />
					<StatusDot variant={v} size="lg" />
				</View>
			))}
		</View>
	),
};
