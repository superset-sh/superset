import type { Meta, StoryObj } from "@storybook/react-vite";
import { CloudTaskIcon } from "./CloudTaskIcon";

const meta = {
	component: CloudTaskIcon,
	decorators: [
		(Story) => (
			<div className="w-[120px] bg-background p-6">
				<Story />
			</div>
		),
	],
	args: {
		task: {
			id: "t1",
			slug: "SUPER-2311",
			externalProvider: null,
			externalKey: null,
			title: "Plugins in cloud boxes",
			status: { type: "started", color: "#f2c94c", progressPercent: 50 },
		},
	},
} satisfies Meta<typeof CloudTaskIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Started: Story = {};

export const Done: Story = {
	args: {
		task: {
			...meta.args.task,
			status: { type: "completed", color: "#5e6ad2", progressPercent: 100 },
		},
	},
};

export const NoStatus: Story = {
	args: { task: { ...meta.args.task, status: null } },
};
