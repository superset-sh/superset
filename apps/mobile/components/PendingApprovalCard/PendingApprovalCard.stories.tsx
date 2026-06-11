import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import {
	PendingApprovalCard,
	type PendingApprovalCardState,
} from "./PendingApprovalCard";

const STATES: PendingApprovalCardState[] = [
	"pending",
	"resolving",
	"approved",
	"declined",
];

const meta: Meta<typeof PendingApprovalCard> = {
	title: "Molecules/PendingApprovalCard",
	component: PendingApprovalCard,
	parameters: {
		docs: {
			description: {
				component:
					"Inline pending-approval card in the message stream (UC-PAUSE-01 §A). Vertical ToolStatusRule + icon (⌖/✓/✕) + title + subtitle + optional ALLOWABLE badge + args preview below hairline. 4 states drive rule color + icon + title override. Composes ToolStatusRule + Icon + vendor Badge + Separator + Text.",
			},
		},
		layout: "fullscreen",
	},
	args: {
		title: "Tool approval required",
		subtitle: "bash · run_tests.sh",
		argsPreview: "$ bun test --filter billing",
		state: "pending",
		alwaysAllowable: false,
		detailed: false,
	},
	argTypes: {
		title: { control: "text" },
		subtitle: { control: "text" },
		argsPreview: { control: "text" },
		state: {
			control: { type: "select" },
			options: STATES,
			description: "pending · resolving (50% opacity) · approved · declined",
		},
		alwaysAllowable: {
			control: "boolean",
			description: "Show ALLOWABLE badge in header (always-allow tools)",
		},
		detailed: {
			control: "boolean",
			description: "Allow multi-line args preview up to ~120pt",
		},
	},
};

export default meta;

type Story = StoryObj<typeof PendingApprovalCard>;

export const Pending: Story = {};

export const AlwaysAllowable: Story = {
	args: { alwaysAllowable: true },
};

export const Resolving: Story = {
	args: { state: "resolving" },
};

export const Approved: Story = {
	args: { state: "approved" },
};

export const Declined: Story = {
	args: { state: "declined" },
};

export const Detailed: Story = {
	args: {
		detailed: true,
		argsPreview: [
			"$ bun test --filter billing",
			"  · src/billing/router.test.ts",
			"  · src/billing/invoice.test.ts",
			"  · src/billing/calc.test.ts",
			"  · timeout: 30s",
			"  · concurrency: 4",
		].join("\n"),
	},
};

export const AllStates: Story = {
	render: () => (
		<View className="gap-2 max-w-sm w-full p-2">
			{STATES.map((s) => (
				<PendingApprovalCard
					key={s}
					state={s}
					title="Tool approval required"
					subtitle="bash · run_tests.sh"
					argsPreview="$ bun test --filter billing"
				/>
			))}
		</View>
	),
};
