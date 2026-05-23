import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { ProgressDots } from "./ProgressDots";

const meta: Meta<typeof ProgressDots> = {
	title: "Components/ProgressDots",
	component: ProgressDots,
	parameters: {
		docs: {
			description: {
				component:
					"3-dot staggered pulse loading indicator. Four variants (muted · accent · live · faint) × three sizes (xs=4px · sm=6px default · md=8px). 1.4s cycle, 200ms stagger per dot via Reanimated. Container is `accessibilityRole=progressbar` with live-region. Respects AccessibilityInfo.isReduceMotionEnabled() — reduced-motion users see static dots at 0.8 opacity.",
			},
		},
		layout: "centered",
	},
	args: {
		variant: "muted",
		size: "sm",
		accessibilityLabel: "Loading",
		paused: false,
	},
	argTypes: {
		variant: {
			control: { type: "select" },
			options: ["muted", "accent", "live", "faint"],
			description:
				"Dot color — muted (default) · accent (ember) · live (mint) · faint",
		},
		size: {
			control: { type: "select" },
			options: ["xs", "sm", "md"],
			description: "xs=4px · sm=6px (default) · md=8px dot diameter",
		},
		accessibilityLabel: {
			control: "text",
			description: "Announced via the live region. Defaults to 'Loading'",
		},
		paused: {
			control: "boolean",
			description:
				"Freezes animation at static opacity — snapshot tests / debug only",
		},
	},
};

export default meta;

type Story = StoryObj<typeof ProgressDots>;

export const Default: Story = {};
export const Accent: Story = { args: { variant: "accent" } };
export const Live: Story = { args: { variant: "live", size: "md" } };
export const Faint: Story = { args: { variant: "faint" } };

export const InLoadingFooter: Story = {
	render: () => (
		<View className="flex-row items-center gap-2 p-4">
			<ProgressDots
				size="sm"
				variant="muted"
				accessibilityLabel="Loading history"
			/>
			<Text variant="small" className="text-muted-foreground">
				Loading history…
			</Text>
		</View>
	),
};

export const AssistantTyping: Story = {
	render: () => (
		<View className="flex-row items-center gap-3 p-4">
			<View className="size-7 rounded-full bg-primary items-center justify-center">
				<Text className="text-primary-foreground text-xs font-bold">A</Text>
			</View>
			<ProgressDots
				size="md"
				variant="live"
				accessibilityLabel="Assistant is typing"
			/>
		</View>
	),
};

export const SlashCommandPreview: Story = {
	render: () => (
		<View className="flex-row items-center gap-2 p-4">
			<Text className="font-mono">/deploy</Text>
			<ProgressDots
				size="xs"
				variant="muted"
				accessibilityLabel="Loading preview"
			/>
		</View>
	),
};

export const AllVariantsAllSizes: Story = {
	render: () => (
		<View className="gap-4 p-4">
			{(["muted", "accent", "live", "faint"] as const).map((v) => (
				<View key={v} className="flex-row items-center gap-6">
					<View className="w-16">
						<Text variant="small" className="text-muted-foreground">
							{v}
						</Text>
					</View>
					<ProgressDots variant={v} size="xs" />
					<ProgressDots variant={v} size="sm" />
					<ProgressDots variant={v} size="md" />
				</View>
			))}
		</View>
	),
};
