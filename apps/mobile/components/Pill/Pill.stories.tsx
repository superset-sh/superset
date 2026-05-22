import type { Meta, StoryObj } from "@storybook/react-native";
import {
	ChevronDown,
	GitBranch,
	type LucideIcon,
	Shield,
	X,
	Zap,
} from "lucide-react-native";
import { View } from "react-native";
import { Pill } from "./Pill";

const ICON_MAP: Record<string, LucideIcon> = {
	ChevronDown,
	GitBranch,
	Shield,
	Zap,
	X,
};

const meta: Meta<typeof Pill> = {
	title: "Components/Pill",
	component: Pill,
	parameters: {
		docs: {
			description: {
				component:
					"Chat-domain pill. Used for composer toolbar chips (model · mode · permission), suggested-answer rows, applied filter tags, pending-action indicators. Larger touch surface than Badge; variant set tuned to chat status.",
			},
		},
	},
	args: {
		label: "Sonnet 4.6",
		variant: "default",
		interactive: false,
	},
	argTypes: {
		label: { control: "text" },
		variant: {
			control: { type: "select" },
			options: ["default", "selected", "warning", "danger", "success", "live"],
		},
		interactive: { control: "boolean" },
		leadingIcon: {
			control: { type: "select" },
			options: ["(none)", ...Object.keys(ICON_MAP)],
			mapping: { "(none)": undefined, ...ICON_MAP },
		},
		trailingIcon: {
			control: { type: "select" },
			options: ["(none)", ...Object.keys(ICON_MAP)],
			mapping: { "(none)": undefined, ...ICON_MAP },
		},
	},
};

export default meta;

type Story = StoryObj<typeof Pill>;

export const ModelChip: Story = {
	args: {
		label: "Sonnet 4.6",
		trailingIcon: ChevronDown,
	},
};

export const ThinkingChip: Story = {
	args: {
		label: "Medium",
		leadingIcon: Zap,
		trailingIcon: ChevronDown,
	},
};

export const PermissionChip: Story = {
	args: {
		label: "Default",
		leadingIcon: Shield,
		trailingIcon: ChevronDown,
	},
};

export const Selected: Story = {
	args: { variant: "selected", label: "Selected" },
};

export const Live: Story = {
	args: { variant: "live", label: "Streaming" },
};

export const Warning: Story = {
	args: { variant: "warning", label: "Pause pending" },
};

export const Danger: Story = {
	args: { variant: "danger", label: "Host offline" },
};

export const Success: Story = {
	args: { variant: "success", label: "Complete" },
};

export const FilterTag: Story = {
	args: {
		label: "main · macbook-pro",
		leadingIcon: GitBranch,
		trailingIcon: X,
		interactive: true,
	},
};

export const SuggestedAnswer: Story = {
	args: {
		label: "Yes, retry the connection",
		interactive: true,
	},
};

export const AllVariants: Story = {
	render: () => (
		<View className="gap-2 items-start">
			<Pill label="default" variant="default" />
			<Pill label="selected" variant="selected" />
			<Pill label="live (streaming)" variant="live" />
			<Pill label="warning (pause)" variant="warning" />
			<Pill label="danger (offline)" variant="danger" />
			<Pill label="success (done)" variant="success" />
		</View>
	),
};
