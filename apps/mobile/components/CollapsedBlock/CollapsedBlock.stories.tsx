import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { CollapsedBlock } from "./CollapsedBlock";

const PLAN_STEPS = [
	"1. Locate the reconnect backoff constant",
	"2. Replace 250ms with exponential backoff",
	"3. Preserve inner try/catch",
	"4. Add unit tests for the backoff schedule",
];

const REASONING_TEXT =
	"The user is reporting reconnect storms on Wi-Fi flap. The backoff is hardcoded to 250ms which is too aggressive — I should adjust it to be exponential starting at 500ms.";

const meta: Meta<typeof CollapsedBlock> = {
	title: "Molecules/CollapsedBlock",
	component: CollapsedBlock,
	parameters: {
		docs: {
			description: {
				component:
					"Collapsible block wrapping agent-generated structured content (UC-RENDER-05/06). 3 kinds: plan (sparkles + accent) · reasoning (brain + muted) · subagent (bot + muted, indented with left rule). Tap summary to toggle. Composes vendor Collapsible + Separator + Icon + Text.",
			},
		},
		layout: "fullscreen",
	},
	args: {
		kind: "plan",
		meta: "12 steps · 1m est",
		defaultOpen: false,
	},
	argTypes: {
		kind: {
			control: { type: "select" },
			options: ["plan", "reasoning", "subagent"],
		},
		meta: { control: "text", description: "Optional meta text after label" },
		defaultOpen: { control: "boolean" },
	},
};

export default meta;

type Story = StoryObj<typeof CollapsedBlock>;

export const PlanCollapsed: Story = {
	render: (args) => (
		<View className="p-4 max-w-sm w-full">
			<CollapsedBlock {...args}>
				{PLAN_STEPS.map((s) => (
					<Text key={s} className="text-sm text-foreground">
						{s}
					</Text>
				))}
			</CollapsedBlock>
		</View>
	),
};

export const PlanExpanded: Story = {
	args: { defaultOpen: true },
	render: (args) => (
		<View className="p-4 max-w-sm w-full">
			<CollapsedBlock {...args}>
				{PLAN_STEPS.map((s) => (
					<Text key={s} className="text-sm text-foreground">
						{s}
					</Text>
				))}
			</CollapsedBlock>
		</View>
	),
};

export const Reasoning: Story = {
	args: { kind: "reasoning", meta: "2.4s", defaultOpen: true },
	render: (args) => (
		<View className="p-4 max-w-sm w-full">
			<CollapsedBlock {...args}>
				<Text className="text-sm text-muted-foreground">{REASONING_TEXT}</Text>
			</CollapsedBlock>
		</View>
	),
};

export const Subagent: Story = {
	args: {
		kind: "subagent",
		meta: "code-reviewer · 12 tool calls",
		defaultOpen: true,
	},
	render: (args) => (
		<View className="p-4 max-w-sm w-full">
			<CollapsedBlock {...args}>
				<Text className="text-sm text-foreground">
					Sub-agent invoked code-reviewer with the staged diff.
				</Text>
				<Text className="text-sm text-foreground">
					Verdict: 0 blocking findings, 2 nit-level suggestions.
				</Text>
			</CollapsedBlock>
		</View>
	),
};

export const AllKinds: Story = {
	render: () => (
		<View className="gap-3 p-4 max-w-sm w-full">
			<CollapsedBlock kind="plan" meta="12 steps" />
			<CollapsedBlock kind="reasoning" meta="2.4s" />
			<CollapsedBlock kind="subagent" meta="code-reviewer · 12 calls" />
		</View>
	),
};
