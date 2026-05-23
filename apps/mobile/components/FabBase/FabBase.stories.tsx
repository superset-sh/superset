import type { Meta, StoryObj } from "@storybook/react-native";
import {
	ArrowDown,
	type LucideIcon,
	MessageSquarePlus,
	Plus,
} from "lucide-react-native";
import { View } from "react-native";
import { FabBase } from "./FabBase";

const ICON_MAP: Record<string, LucideIcon> = {
	Plus,
	ArrowDown,
	MessageSquarePlus,
};

const meta: Meta<typeof FabBase> = {
	title: "Components/FabBase",
	component: FabBase,
	parameters: {
		docs: {
			description: {
				component:
					"Floating action button base — sessions-list +, scroll-back-button, extended pill FAB. Three variants (accent · neutral · overlay) × two sizes (md=56pt · lg=64pt). Optional `label` enables extended pill; optional `liveRing` adds a pulsing mint halo. Always carries elevation shadow; aria-label is required.",
			},
		},
		layout: "centered",
	},
	args: {
		icon: Plus,
		accessibilityLabel: "New chat session",
		variant: "accent",
		size: "md",
		loading: false,
		liveRing: false,
		disabled: false,
	},
	argTypes: {
		icon: {
			control: { type: "select" },
			options: Object.keys(ICON_MAP),
			mapping: ICON_MAP,
			description: "Lucide icon component (centered when no label)",
		},
		accessibilityLabel: {
			control: "text",
			description: "Required — action description, e.g. 'New chat session'",
		},
		label: {
			control: "text",
			description: "Optional visible label — enables extended pill variant",
		},
		variant: {
			control: { type: "select" },
			options: ["accent", "neutral", "overlay"],
		},
		size: {
			control: { type: "select" },
			options: ["md", "lg"],
			description: "md=56pt diameter (icon 24) · lg=64pt diameter (icon 28)",
		},
		loading: {
			control: "boolean",
			description: "Hides icon, renders ActivityIndicator, sets aria-busy",
		},
		liveRing: {
			control: "boolean",
			description: "Decorative pulsing mint ring; honors reduced-motion",
		},
		disabled: { control: "boolean" },
	},
};

export default meta;

type Story = StoryObj<typeof FabBase>;

export const NewChat: Story = {};

export const ExtendedPill: Story = {
	args: { label: "New chat", icon: MessageSquarePlus },
};

export const ScrollBack: Story = {
	args: {
		icon: ArrowDown,
		accessibilityLabel: "Scroll to latest",
		variant: "overlay",
	},
};

export const Neutral: Story = {
	args: {
		icon: Plus,
		accessibilityLabel: "New chat session (neutral)",
		variant: "neutral",
	},
};

export const Large: Story = {
	args: { size: "lg" },
};

export const Loading: Story = {
	args: { loading: true },
};

export const Disabled: Story = {
	args: { disabled: true },
};

export const WithLiveRing: Story = {
	args: { liveRing: true },
};

export const AllVariantsAllSizes: Story = {
	render: () => (
		<View className="gap-6 p-4 items-center">
			<View className="flex-row items-center gap-6">
				<FabBase icon={Plus} accessibilityLabel="accent md" variant="accent" />
				<FabBase
					icon={Plus}
					accessibilityLabel="neutral md"
					variant="neutral"
				/>
				<FabBase
					icon={Plus}
					accessibilityLabel="overlay md"
					variant="overlay"
				/>
			</View>
			<View className="flex-row items-center gap-6">
				<FabBase
					icon={Plus}
					accessibilityLabel="accent lg"
					variant="accent"
					size="lg"
				/>
				<FabBase
					icon={Plus}
					accessibilityLabel="neutral lg"
					variant="neutral"
					size="lg"
				/>
				<FabBase
					icon={Plus}
					accessibilityLabel="overlay lg"
					variant="overlay"
					size="lg"
				/>
			</View>
		</View>
	),
};
