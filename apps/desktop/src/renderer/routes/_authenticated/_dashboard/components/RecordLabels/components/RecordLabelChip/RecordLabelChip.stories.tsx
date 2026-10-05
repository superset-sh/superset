import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { RecordLabelChip } from "./RecordLabelChip";

const meta = {
	component: RecordLabelChip,
	decorators: [
		(Story) => (
			<div className="w-[240px] bg-background p-6">
				<Story />
			</div>
		),
	],
	args: {
		label: { id: "label-perf", name: "perf", color: "#ef4444" },
		onClick: fn(),
	},
} satisfies Meta<typeof RecordLabelChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Colored: Story = {};

export const NoColor: Story = {
	args: {
		label: { id: "label-needs-review", name: "needs-review", color: null },
	},
};
