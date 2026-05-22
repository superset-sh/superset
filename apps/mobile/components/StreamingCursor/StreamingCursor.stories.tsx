import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { StreamingCursor } from "./StreamingCursor";

function StreamingCursorShowcase({
	glyph,
	durationMs,
	className,
}: {
	glyph: string;
	durationMs: number;
	className: string;
}) {
	return (
		<View className="gap-3">
			<View className="flex-row items-end">
				<Text>The agent is currently generating a response</Text>
				<StreamingCursor
					glyph={glyph}
					durationMs={durationMs}
					className={className}
				/>
			</View>
			<Text variant="muted" className="text-xs">
				glyph={JSON.stringify(glyph)} · durationMs={durationMs} · className=
				{JSON.stringify(className)}
			</Text>
		</View>
	);
}

const meta: Meta<typeof StreamingCursorShowcase> = {
	title: "Components/StreamingCursor",
	component: StreamingCursorShowcase,
	parameters: {
		docs: {
			description: {
				component:
					"Blinking text cursor (▌) appended to streaming assistant content (UC-RENDER-01). Reanimated opacity loop. Hidden from screen readers. Override glyph, duration, or color via props.",
			},
		},
	},
	args: {
		glyph: "▌",
		durationMs: 600,
		className: "",
	},
	argTypes: {
		glyph: { control: "text" },
		durationMs: { control: { type: "range", min: 100, max: 2000, step: 50 } },
		className: {
			control: { type: "select" },
			options: ["", "text-streaming-cursor", "text-primary", "text-foreground"],
		},
	},
};

export default meta;

type Story = StoryObj<typeof StreamingCursorShowcase>;

export const Default: Story = {};
export const FastBlink: Story = { args: { durationMs: 300 } };
export const SlowBlink: Story = { args: { durationMs: 1200 } };
export const EmberColor: Story = { args: { className: "text-primary" } };
export const UnderscoreGlyph: Story = { args: { glyph: "_" } };
