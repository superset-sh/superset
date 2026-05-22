import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { Badge } from "@/components/ui/badge";
import { Text } from "@/components/ui/text";

type Variant = "default" | "secondary" | "destructive" | "outline";

function BadgeShowcase({
	variant,
	label,
}: {
	variant: Variant;
	label: string;
}) {
	return (
		<Badge variant={variant}>
			<Text>{label}</Text>
		</Badge>
	);
}

const meta: Meta<typeof BadgeShowcase> = {
	title: "Components/Badge",
	component: BadgeShowcase,
	parameters: {
		docs: {
			description: {
				component:
					'Compact rounded label. Used for "new" tags on model options, `·N` filter count, "1 of N" approval counter. Pill component (chat-domain) handles different semantics — see Components/Pill.',
			},
		},
	},
	args: {
		variant: "default",
		label: "new",
	},
	argTypes: {
		variant: {
			control: { type: "select" },
			options: ["default", "secondary", "destructive", "outline"],
		},
		label: { control: "text" },
	},
};

export default meta;

type Story = StoryObj<typeof BadgeShowcase>;

export const Default: Story = {};

export const NewModelTag: Story = {
	args: { label: "new" },
	parameters: {
		docs: {
			description: {
				story: "On Opus 4.7 row in the model picker popover (UC-COMP-04 §A).",
			},
		},
	},
};

export const FilterCount: Story = {
	args: { variant: "secondary", label: "3" },
	parameters: {
		docs: {
			description: {
				story:
					"`·N` filter count on FilterButton when activeFilters.length ≥ 1.",
			},
		},
	},
};

export const ApprovalCounter: Story = {
	args: { variant: "outline", label: "1 of 3" },
	parameters: {
		docs: {
			description: {
				story:
					"Multi-approval counter in PendingApprovalFooter (UC-PAUSE-01 §A).",
			},
		},
	},
};

export const Destructive: Story = {
	args: { variant: "destructive", label: "failed" },
};

export const AllVariants: Story = {
	render: () => (
		<View className="flex-row flex-wrap gap-2">
			<Badge variant="default">
				<Text>default</Text>
			</Badge>
			<Badge variant="secondary">
				<Text>secondary</Text>
			</Badge>
			<Badge variant="destructive">
				<Text>destructive</Text>
			</Badge>
			<Badge variant="outline">
				<Text>outline</Text>
			</Badge>
		</View>
	),
};
