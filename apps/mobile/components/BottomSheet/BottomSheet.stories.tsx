import {
	BottomSheetModalProvider,
	BottomSheetView,
} from "@gorhom/bottom-sheet";
import type { Meta, StoryObj } from "@storybook/react-native";
import { useState } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { BottomSheet, type BottomSheetProps } from "./BottomSheet";

const SAMPLE_LINES: ReadonlyArray<string> = [
	"Approve · Decline · Always",
	"Workspace: superset · main",
	"Last touched 4 minutes ago",
	"Tap to switch sessions",
	"Long press for context menu",
	"Permission mode: default",
	"Thinking level: medium",
	"Model: Sonnet 4.6",
	"3 pending tool calls",
	"Press ESC to dismiss",
	"Drag down to close",
	"Backdrop tap also closes",
];

type ShowcaseProps = Omit<BottomSheetProps, "open" | "onClose" | "children"> & {
	triggerLabel: string;
	bodyLines: number;
};

function BottomSheetShowcase({
	triggerLabel,
	bodyLines,
	...rest
}: ShowcaseProps) {
	const [open, setOpen] = useState(false);
	const lines = SAMPLE_LINES.slice(0, Math.min(bodyLines, SAMPLE_LINES.length));
	return (
		<GestureHandlerRootView style={{ flex: 1 }}>
			<BottomSheetModalProvider>
				<View className="flex-1 items-center justify-center bg-background p-6">
					<Button onPress={() => setOpen(true)}>
						<Text>{triggerLabel}</Text>
					</Button>
					<BottomSheet {...rest} open={open} onClose={() => setOpen(false)}>
						<BottomSheetView style={{ padding: 24, gap: 12 }}>
							<Text className="text-foreground text-lg font-semibold">
								Sheet content
							</Text>
							{lines.map((line) => (
								<Text key={line} className="text-muted-foreground">
									{line}
								</Text>
							))}
						</BottomSheetView>
					</BottomSheet>
				</View>
			</BottomSheetModalProvider>
		</GestureHandlerRootView>
	);
}

const meta: Meta<typeof BottomSheetShowcase> = {
	title: "Organisms/BottomSheet",
	component: BottomSheetShowcase,
	parameters: {
		docs: {
			description: {
				component:
					"Project-themed wrapper around @gorhom/bottom-sheet BottomSheetModal. Drag-down dismiss, tap-backdrop dismiss, themed handle + surface via Uniwind tokens. Used by ask_user sheet (UC-PAUSE-02), session overflow (UC-SESS-04), new-chat picker (UC-NAV-04), project/filter pickers (UC-NAV-08).",
			},
		},
		layout: "fullscreen",
	},
	args: {
		triggerLabel: "Open sheet",
		bodyLines: 4,
		snapPoints: ["50%"],
		enablePanDownToClose: true,
		enableBackdropDismiss: true,
	},
	argTypes: {
		triggerLabel: { control: "text" },
		bodyLines: { control: { type: "number", min: 1, max: 12, step: 1 } },
		enablePanDownToClose: { control: "boolean" },
		enableBackdropDismiss: { control: "boolean" },
	},
};

export default meta;

type Story = StoryObj<typeof BottomSheetShowcase>;

export const HalfHeight: Story = {};

export const TallSheet: Story = {
	args: {
		snapPoints: ["80%"],
		bodyLines: 10,
	},
};

export const TwoSnapPoints: Story = {
	args: {
		snapPoints: ["30%", "75%"],
		bodyLines: 8,
	},
};
