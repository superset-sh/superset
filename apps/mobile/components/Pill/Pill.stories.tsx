import type { Meta, StoryObj } from "@storybook/react-native";
import {
	GitBranch,
	type LucideIcon,
	Shield,
	Sparkles,
	Zap,
} from "lucide-react-native";
import { View } from "react-native";
import { Pill } from "./Pill";

const ICON_MAP: Record<string, LucideIcon> = {
	GitBranch,
	Shield,
	Sparkles,
	Zap,
};

const meta: Meta<typeof Pill> = {
	title: "Components/Pill",
	component: Pill,
	parameters: {
		docs: {
			description: {
				component:
					"Chat-domain rounded chip — model chips, slash-command pills, suggested answers, applied filter tags, status badges. Six variants × three sizes × monospace/uppercase modifiers. Optional dismiss button renders a separate ✕ child with its own 14pt hitSlop for 44pt total touch target.",
			},
		},
	},
	args: {
		label: "Sonnet 4.6",
		variant: "default",
		size: "md",
		selected: false,
		interactive: false,
		monospace: false,
		uppercase: false,
		disabled: false,
	},
	argTypes: {
		label: { control: "text", description: "Pill body text" },
		variant: {
			control: { type: "select" },
			options: ["default", "strong", "accent", "live", "warning", "danger"],
			description:
				"default (neutral) · strong (selected/active) · accent (ember slash-command) · live · warning · danger",
		},
		size: {
			control: { type: "select" },
			options: ["sm", "md", "lg"],
			description: "sm=20h · md=28h (default) · lg=36h",
		},
		selected: {
			control: "boolean",
			description: "is-selected composable state — upgrades bg to accent",
		},
		interactive: {
			control: "boolean",
			description:
				"When true (or when onPress is provided), renders as Pressable",
		},
		monospace: {
			control: "boolean",
			description: "Switches label to Geist Mono (code-like values)",
		},
		uppercase: {
			control: "boolean",
			description: "UPPERCASE + tracking-wider, e.g. STREAMING badge",
		},
		leadingIcon: {
			control: { type: "select" },
			options: ["(none)", ...Object.keys(ICON_MAP)],
			mapping: { "(none)": undefined, ...ICON_MAP },
			description: "Optional Lucide icon before the label",
		},
		disabled: { control: "boolean" },
	},
};

export default meta;

type Story = StoryObj<typeof Pill>;

export const ModelChip: Story = {
	args: { label: "Sonnet 4.6", leadingIcon: Sparkles, monospace: true },
};

export const ThinkingChip: Story = {
	args: { label: "low", leadingIcon: Zap, variant: "default" },
};

export const PermissionChip: Story = {
	args: { label: "default", leadingIcon: Shield, variant: "default" },
};

export const AccentSlashCommand: Story = {
	args: { label: "/clear", variant: "accent", monospace: true },
};

export const Selected: Story = {
	args: { label: "All projects", selected: true, interactive: true },
};

export const LiveStreaming: Story = {
	args: { label: "STREAMING", variant: "live", uppercase: true, size: "sm" },
};

export const WarningPending: Story = {
	args: {
		label: "AWAITING APPROVAL",
		variant: "warning",
		uppercase: true,
		size: "sm",
	},
};

export const DangerOffline: Story = {
	args: { label: "OFFLINE", variant: "danger", uppercase: true, size: "sm" },
};

export const FilterTagDismissible: Story = {
	args: {
		label: "main · macbook-pro",
		leadingIcon: GitBranch,
		variant: "strong",
		interactive: true,
		onDismiss: () => {},
		dismissAccessibilityLabel: "Remove filter main · macbook-pro",
	},
};

export const SuggestedAnswer: Story = {
	args: {
		label: "Yes, retry the connection",
		variant: "accent",
		interactive: true,
		size: "lg",
	},
};

export const AllVariants: Story = {
	render: () => (
		<View className="gap-2 items-start p-4">
			<Pill label="default" variant="default" />
			<Pill label="strong (selected filter)" variant="strong" />
			<Pill label="/accent (slash-command)" variant="accent" monospace />
			<Pill label="STREAMING" variant="live" uppercase size="sm" />
			<Pill label="PENDING" variant="warning" uppercase size="sm" />
			<Pill label="OFFLINE" variant="danger" uppercase size="sm" />
		</View>
	),
};

export const AllSizes: Story = {
	render: () => (
		<View className="gap-2 items-start p-4">
			<Pill label="sm — 20h" size="sm" />
			<Pill label="md — 28h (default)" size="md" />
			<Pill label="lg — 36h" size="lg" />
		</View>
	),
};
