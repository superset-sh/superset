import type { Meta, StoryObj } from "@storybook/react-vite";
import { RecordSection } from "./RecordSection";

const meta = {
	component: RecordSection,
	decorators: [
		(Story) => (
			<div className="w-[820px] bg-background p-6">
				<Story />
			</div>
		),
	],
	args: {
		title: "Summary",
		children: (
			<p className="text-[14px] leading-relaxed">
				Memoized the hover measurement; frame time 38ms → 6ms. PR #7855 is open.
			</p>
		),
	},
} satisfies Meta<typeof RecordSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
