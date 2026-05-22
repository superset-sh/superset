import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { Text } from "@/components/ui/text";
import {
	StreamingCursor,
	type StreamingCursorVariant,
} from "./StreamingCursor";

const VARIANTS: StreamingCursorVariant[] = ["default", "steady", "paused"];

const meta: Meta<typeof StreamingCursor> = {
	title: "Components/StreamingCursor",
	component: StreamingCursor,
	parameters: {
		docs: {
			description: {
				component:
					"Blinking text cursor (▌) appended to streaming assistant content (UC-RENDER-01). Three variants: `default` (1s steps(2) mint), `steady` (no animation), `paused` (0.6s steps(2) amber). Animation emulates CSS steps(2) via Reanimated withSequence. Respects AccessibilityInfo.isReduceMotionEnabled() — reduced-motion users see a static cursor regardless of variant.",
			},
		},
	},
	args: {
		variant: "default",
		glyph: "▌",
	},
	argTypes: {
		variant: {
			control: { type: "select" },
			options: VARIANTS,
			description:
				"default (mint 1s blink) · steady (no animation) · paused (amber 0.6s blink)",
		},
		glyph: {
			control: "text",
			description: "Override the cursor character (default ▌)",
		},
		durationMs: {
			control: { type: "range", min: 100, max: 2000, step: 50 },
			description:
				"Override variant default — default=1000 · paused=600 · steady=0",
		},
		className: {
			control: "text",
			description:
				"Tailwind override — e.g. text-primary, text-foreground. Overrides variant color.",
		},
	},
};

export default meta;

type Story = StoryObj<typeof StreamingCursor>;

export const Default: Story = {};
export const Steady: Story = { args: { variant: "steady" } };
export const Paused: Story = { args: { variant: "paused" } };

export const InStreamingMessage: Story = {
	render: () => (
		<View className="gap-2 p-4">
			<View className="flex-row items-end flex-wrap">
				<Text>
					Refactoring the relay tunnel reconnect loop now—I'll preserve the
					inner try/catch and log err.code before the backoff sleeps
				</Text>
				<StreamingCursor variant="default" />
			</View>
		</View>
	),
};

export const InPausedMessage: Story = {
	render: () => (
		<View className="gap-2 p-4">
			<View className="flex-row items-end flex-wrap">
				<Text>Awaiting approval to continue</Text>
				<StreamingCursor variant="paused" />
			</View>
		</View>
	),
};

export const AllVariants: Story = {
	render: () => (
		<View className="gap-4 p-4">
			{VARIANTS.map((v) => (
				<View key={v} className="flex-row items-end gap-2">
					<Text variant="small" className="w-20 text-muted-foreground">
						{v}
					</Text>
					<Text>generating</Text>
					<StreamingCursor variant={v} />
				</View>
			))}
		</View>
	),
};
