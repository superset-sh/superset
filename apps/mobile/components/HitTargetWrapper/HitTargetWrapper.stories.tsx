import type { Meta, StoryObj } from "@storybook/react-native";
import { ChevronDown, X } from "lucide-react-native";
import { View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { HitTargetWrapper } from "./HitTargetWrapper";

const meta: Meta<typeof HitTargetWrapper> = {
	title: "Components/HitTargetWrapper",
	component: HitTargetWrapper,
	parameters: {
		docs: {
			description: {
				component:
					"Invisible 44pt tap-zone wrapper for visual elements too small to be tap-friendly (14px ✕, 16px chevron, 10px drag handle). The wrapper IS the Pressable; children are decorative (aria-hidden). Square (default) or circle shape. `debug` outlines the tap zone in amber — for design review only, never ship.",
			},
		},
		layout: "centered",
	},
	args: {
		accessibilityLabel: "Dismiss notification",
		shape: "square",
		debug: false,
		disabled: false,
	},
	argTypes: {
		accessibilityLabel: {
			control: "text",
			description: "Required — describes the action, not the glyph",
		},
		shape: {
			control: { type: "select" },
			options: ["square", "circle"],
			description:
				"square (drag handles, dismiss in flat row) · circle (badge-style dismiss)",
		},
		debug: {
			control: "boolean",
			description:
				"Dashed amber outline showing 44pt bounds — DESIGN REVIEW ONLY, strip before shipping",
		},
		disabled: { control: "boolean" },
	},
};

export default meta;

type Story = StoryObj<typeof HitTargetWrapper>;

export const DismissX: Story = {
	render: (args) => (
		<HitTargetWrapper {...args}>
			<Icon as={X} className="size-3.5 text-foreground" />
		</HitTargetWrapper>
	),
};

export const PickerChevron: Story = {
	args: { accessibilityLabel: "Open picker", shape: "square" },
	render: (args) => (
		<HitTargetWrapper {...args}>
			<Icon as={ChevronDown} className="size-4 text-foreground" />
		</HitTargetWrapper>
	),
};

export const CircleDismiss: Story = {
	args: { accessibilityLabel: "Close", shape: "circle" },
	render: (args) => (
		<HitTargetWrapper {...args}>
			<Icon as={X} className="size-3.5 text-foreground" />
		</HitTargetWrapper>
	),
};

export const DebugOutline: Story = {
	args: { debug: true },
	render: (args) => (
		<View className="gap-4 items-start p-4">
			<Text variant="muted" className="text-xs">
				Debug outline visualizes the 44pt tap bounds. NEVER ship this modifier.
			</Text>
			<HitTargetWrapper {...args}>
				<Icon as={X} className="size-3.5 text-foreground" />
			</HitTargetWrapper>
		</View>
	),
};

export const InContextSmallGlyph: Story = {
	render: () => (
		<View className="flex-row items-center bg-card border border-border rounded-md p-3 gap-2 max-w-xs">
			<Text className="flex-1">File saved successfully</Text>
			<HitTargetWrapper accessibilityLabel="Dismiss" shape="circle">
				<Icon as={X} className="size-3.5 text-muted-foreground" />
			</HitTargetWrapper>
		</View>
	),
};
