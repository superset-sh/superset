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
					"Single colored circle for status indication. Five variants from the state palette (live · warning · danger · success · neutral) × three explicit sizes (xs=6px · sm=8px default · md=10px). `live` pulses (1.4s scale + opacity halo); `warning` shows a static ring halo. Both respect AccessibilityInfo.isReduceMotionEnabled() — reduced-motion users see only the static glow.",
			},
		},
	},
	args: {
		variant: "live",
		size: "sm",
		accessibilityLabel: "Streaming",
	},
	argTypes: {
		variant: {
			control: { type: "select" },
			options: ["live", "warning", "danger", "success", "neutral"],
			description:
				"State-palette tint. live and warning render an additional halo behind the dot.",
		},
		size: {
			control: { type: "select" },
			options: ["xs", "sm", "md"],
			description: "xs=6px · sm=8px (default) · md=10px",
		},
		accessibilityLabel: {
			control: "text",
			description:
				"When provided, dot is treated as a standalone image landmark — otherwise it is decorative and relies on adjacent label text",
		},
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

export const SizeXs: Story = { args: { size: "xs" } };
export const SizeSm: Story = { args: { size: "sm" } };
export const SizeMd: Story = { args: { size: "md" } };

export const InSessionRow: Story = {
	render: () => (
		<View className="gap-2 p-4">
			<View className="flex-row items-center gap-3">
				<StatusDot variant="live" />
				<Text className="font-medium">Refactor relay tunnel</Text>
				<Text variant="muted" className="text-xs">
					· main · macbook-pro · 2m
				</Text>
			</View>
			<View className="flex-row items-center gap-3">
				<StatusDot variant="warning" />
				<Text className="font-medium">Migrate auth flow</Text>
				<Text variant="muted" className="text-xs">
					· feat-auth · macbook-pro · 5m
				</Text>
			</View>
			<View className="flex-row items-center gap-3">
				<StatusDot variant="neutral" />
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
		<View className="gap-4 p-4">
			{(["live", "warning", "danger", "success", "neutral"] as const).map(
				(v) => (
					<View key={v} className="flex-row items-center gap-6">
						<View className="w-20">
							<Text variant="small" className="text-muted-foreground">
								{v}
							</Text>
						</View>
						<StatusDot variant={v} size="xs" />
						<StatusDot variant={v} size="sm" />
						<StatusDot variant={v} size="md" />
					</View>
				),
			)}
		</View>
	),
};
