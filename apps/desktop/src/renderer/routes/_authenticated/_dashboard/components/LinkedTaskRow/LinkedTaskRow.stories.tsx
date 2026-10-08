import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { LinkedTaskRow } from "./LinkedTaskRow";

const meta = {
	component: LinkedTaskRow,
	decorators: [
		(Story) => (
			<div className="w-[372px] bg-background p-6">
				<Story />
			</div>
		),
	],
	args: {
		task: {
			id: "t2",
			slug: "SUPER-2470",
			externalProvider: null,
			externalKey: null,
			title: "Sidebar hover lag",
			status: { type: "started", color: "#f2c94c", progressPercent: 50 },
		},
		onOpen: fn(),
		onUnlink: fn(),
	},
} satisfies Meta<typeof LinkedTaskRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ShortTitle: Story = {};

export const LongTitle: Story = {
	args: {
		task: {
			id: "t1",
			slug: "SUPER-2311",
			externalProvider: null,
			externalKey: null,
			title: "Figure out how to get plugins and skills working in cloud boxes",
			status: { type: "started", color: "#f2c94c", progressPercent: 50 },
		},
	},
};

export const NoStatus: Story = {
	args: {
		task: {
			id: "t3",
			slug: "SUPER-2452",
			externalProvider: null,
			externalKey: null,
			title: "No mechanism for reporting sidebar lag",
			status: null,
		},
	},
};
