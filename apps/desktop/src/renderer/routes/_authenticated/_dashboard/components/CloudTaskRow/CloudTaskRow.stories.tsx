import type { Meta, StoryObj } from "@storybook/react-vite";
import { LuX } from "react-icons/lu";
import { fn } from "storybook/test";
import { CloudTaskRow } from "./CloudTaskRow";

const meta = {
	component: CloudTaskRow,
	decorators: [
		(Story) => (
			<div className="w-80 bg-background p-6">
				<Story />
			</div>
		),
	],
	args: {
		task: {
			id: "task-2463",
			slug: "SUPER-2463",
			externalProvider: null,
			externalKey: null,
			title: "Cloud workspace presence in the sidebar",
			status: { type: "started", color: "#f2c94c", progressPercent: 60 },
		},
		onOpen: fn(),
	},
} satisfies Meta<typeof CloudTaskRow>;

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

export const LongTitle: Story = {
	args: {
		task: {
			...meta.args.task,
			title:
				"Only my cloud boxes in the sidebar by default, with everyone else's one click away",
		},
	},
};

export const WithTrailing: Story = {
	args: {
		trailing: (
			<button
				type="button"
				aria-label="Unlink"
				className="flex size-5 items-center justify-center rounded text-muted-foreground"
			>
				<LuX className="size-3" />
			</button>
		),
	},
};
