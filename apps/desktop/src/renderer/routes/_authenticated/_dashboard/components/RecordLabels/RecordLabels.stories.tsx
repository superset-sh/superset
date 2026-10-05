import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { RecordLabels } from "./RecordLabels";

const knownLabels = [
	{ id: "label-perf", name: "perf", color: "#ef4444" },
	{ id: "label-sidebar", name: "sidebar", color: "#3b82f6" },
	{ id: "label-needs-review", name: "needs-review", color: null },
	{ id: "label-billing", name: "billing", color: "#22c55e" },
	{ id: "label-mobile", name: "mobile", color: "#a855f7" },
];

const meta = {
	component: RecordLabels,
	decorators: [
		(Story) => (
			<div className="w-[760px] bg-background p-6">
				<Story />
			</div>
		),
	],
	args: {
		labels: knownLabels.slice(0, 3),
		knownLabels,
		onAddLabel: fn(),
		onRemoveLabel: fn(),
	},
} satisfies Meta<typeof RecordLabels>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Several: Story = {};

export const None: Story = { args: { labels: [] } };

export const One: Story = { args: { labels: knownLabels.slice(4) } };
