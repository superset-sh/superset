import type { Meta, StoryObj } from "@storybook/react-native";
import {
	ArrowLeft,
	Copy,
	type LucideIcon,
	MoreVertical,
	Send,
	Square,
	X,
} from "lucide-react-native";
import { View } from "react-native";
import { IconButton } from "./IconButton";

const ICON_MAP: Record<string, LucideIcon> = {
	Send,
	Square,
	X,
	ArrowLeft,
	MoreVertical,
	Copy,
};

const meta: Meta<typeof IconButton> = {
	title: "Components/IconButton",
	component: IconButton,
	parameters: {
		docs: {
			description: {
				component:
					"Icon-only button with guaranteed 44pt hit target. Used by Send/Stop/Close/Back/More/Copy across chat. Variants tinted via theme tokens; no hardcoded colors.",
			},
		},
	},
	args: {
		icon: Send,
		accessibilityLabel: "Send message",
		variant: "primary",
		size: "md",
		disabled: false,
	},
	argTypes: {
		icon: {
			control: { type: "select" },
			options: Object.keys(ICON_MAP),
			mapping: ICON_MAP,
		},
		accessibilityLabel: { control: "text" },
		variant: {
			control: { type: "select" },
			options: ["default", "primary", "secondary", "ghost", "destructive"],
		},
		size: {
			control: { type: "select" },
			options: ["sm", "md", "lg"],
		},
		disabled: { control: "boolean" },
	},
};

export default meta;

type Story = StoryObj<typeof IconButton>;

export const SendPrimary: Story = {};

export const StopDestructive: Story = {
	args: {
		icon: Square,
		accessibilityLabel: "Stop streaming",
		variant: "destructive",
	},
};

export const CloseGhost: Story = {
	args: {
		icon: X,
		accessibilityLabel: "Close",
		variant: "ghost",
	},
};

export const BackDefault: Story = {
	args: {
		icon: ArrowLeft,
		accessibilityLabel: "Back",
		variant: "default",
	},
};

export const MoreVerticalSecondary: Story = {
	args: {
		icon: MoreVertical,
		accessibilityLabel: "Session menu",
		variant: "secondary",
	},
};

export const CopyDisabled: Story = {
	args: {
		icon: Copy,
		accessibilityLabel: "Copy message",
		variant: "default",
		disabled: true,
	},
};

export const AllVariants: Story = {
	render: () => (
		<View className="flex-row flex-wrap gap-3">
			<IconButton icon={Send} accessibilityLabel="default" variant="default" />
			<IconButton icon={Send} accessibilityLabel="primary" variant="primary" />
			<IconButton
				icon={Send}
				accessibilityLabel="secondary"
				variant="secondary"
			/>
			<IconButton icon={Send} accessibilityLabel="ghost" variant="ghost" />
			<IconButton
				icon={Send}
				accessibilityLabel="destructive"
				variant="destructive"
			/>
		</View>
	),
};

export const AllSizes: Story = {
	render: () => (
		<View className="flex-row items-center gap-3">
			<IconButton
				icon={Send}
				accessibilityLabel="sm"
				variant="primary"
				size="sm"
			/>
			<IconButton
				icon={Send}
				accessibilityLabel="md"
				variant="primary"
				size="md"
			/>
			<IconButton
				icon={Send}
				accessibilityLabel="lg"
				variant="primary"
				size="lg"
			/>
		</View>
	),
};
