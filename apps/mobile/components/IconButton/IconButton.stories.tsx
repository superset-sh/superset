import type { Meta, StoryObj } from "@storybook/react-native";
import {
	ArrowLeft,
	Copy,
	type LucideIcon,
	MoreVertical,
	Plus,
	Send,
	Square,
	Trash2,
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
	Trash2,
	Plus,
};

const meta: Meta<typeof IconButton> = {
	title: "Components/IconButton",
	component: IconButton,
	parameters: {
		docs: {
			description: {
				component:
					"Icon-only Pressable with guaranteed 44pt hit target at the default `md` size. Five variants (ghost · soft · primary · neutral · destructive) × four sizes (xs 28 · sm 36 · md 44 · lg 56) × two shapes (default · pill). Loading state hides the icon and shows a spinner with aria-busy.",
			},
		},
	},
	args: {
		icon: Send,
		accessibilityLabel: "Send message",
		variant: "ghost",
		size: "md",
		shape: "default",
		disabled: false,
		loading: false,
	},
	argTypes: {
		icon: {
			control: { type: "select" },
			options: Object.keys(ICON_MAP),
			mapping: ICON_MAP,
			description: "Lucide icon component rendered in the button center",
		},
		accessibilityLabel: {
			control: "text",
			description:
				"Required — action description (not icon name). e.g. 'Send message', 'Back to sessions'",
		},
		variant: {
			control: { type: "select" },
			options: ["ghost", "soft", "primary", "neutral", "destructive"],
			description: "Color/background tint",
		},
		size: {
			control: { type: "select" },
			options: ["xs", "sm", "md", "lg"],
			description:
				"xs=28×28 · sm=36×36 · md=44×44 (touch-target) · lg=56×56 (FAB-adjacent)",
		},
		shape: {
			control: { type: "select" },
			options: ["default", "pill"],
			description: "rounded-md (default) or rounded-full (pill / FAB-style)",
		},
		disabled: { control: "boolean" },
		loading: {
			control: "boolean",
			description: "Hides icon, renders ActivityIndicator, sets aria-busy=true",
		},
	},
};

export default meta;

type Story = StoryObj<typeof IconButton>;

export const GhostBack: Story = {
	args: {
		icon: ArrowLeft,
		accessibilityLabel: "Back to sessions",
		variant: "ghost",
		size: "lg",
	},
};

export const PrimarySend: Story = {
	args: {
		icon: Send,
		accessibilityLabel: "Send message",
		variant: "primary",
		shape: "pill",
	},
};

export const SoftCopy: Story = {
	args: {
		icon: Copy,
		accessibilityLabel: "Copy code",
		variant: "soft",
		size: "sm",
	},
};

export const DestructiveDelete: Story = {
	args: {
		icon: Trash2,
		accessibilityLabel: "Delete session",
		variant: "destructive",
		size: "sm",
	},
};

export const NeutralClose: Story = {
	args: {
		icon: X,
		accessibilityLabel: "Close",
		variant: "neutral",
		size: "sm",
		shape: "pill",
	},
};

export const StreamingStop: Story = {
	args: {
		icon: Square,
		accessibilityLabel: "Stop streaming",
		variant: "destructive",
		shape: "pill",
	},
};

export const LoadingSend: Story = {
	args: {
		icon: Send,
		accessibilityLabel: "Send message",
		variant: "primary",
		shape: "pill",
		loading: true,
	},
};

export const DisabledMore: Story = {
	args: {
		icon: MoreVertical,
		accessibilityLabel: "Session menu",
		variant: "ghost",
		disabled: true,
	},
};

export const AllVariants: Story = {
	render: () => (
		<View className="flex-row flex-wrap items-center gap-3 p-4">
			<IconButton icon={Send} accessibilityLabel="ghost" variant="ghost" />
			<IconButton icon={Send} accessibilityLabel="soft" variant="soft" />
			<IconButton icon={Send} accessibilityLabel="primary" variant="primary" />
			<IconButton icon={Send} accessibilityLabel="neutral" variant="neutral" />
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
		<View className="flex-row items-center gap-3 p-4">
			<IconButton
				icon={Send}
				accessibilityLabel="xs"
				variant="primary"
				size="xs"
			/>
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

export const PillShapes: Story = {
	render: () => (
		<View className="flex-row items-center gap-3 p-4">
			<IconButton
				icon={Plus}
				accessibilityLabel="new chat (md pill)"
				variant="primary"
				size="md"
				shape="pill"
			/>
			<IconButton
				icon={Plus}
				accessibilityLabel="new chat (lg pill)"
				variant="primary"
				size="lg"
				shape="pill"
			/>
		</View>
	),
};
