import type { Meta, StoryObj } from "@storybook/react-vite";
import { CloudTaskIcon } from "renderer/routes/_authenticated/_dashboard/components/CloudTaskIcon";
import { TaskProjectIcon } from "renderer/routes/_authenticated/_dashboard/components/TaskProjectIcon";
import { fn } from "storybook/test";
import { CloudWorkspaceSuggestionChip } from "./CloudWorkspaceSuggestionChip";

const task = {
	id: "t2",
	slug: "SUPER-2384",
	externalProvider: null,
	externalKey: null,
	title: "Mobile: block comment popover on small screens",
	status: { type: "started", color: "#f2c94c", progressPercent: 50 },
};

const meta = {
	component: CloudWorkspaceSuggestionChip,
	decorators: [
		(Story) => (
			<div className="w-[400px] bg-background p-6">
				<Story />
			</div>
		),
	],
	args: {
		acceptLabel: "Link this task",
		onAccept: fn(),
		onDismiss: fn(),
		children: (
			<>
				<CloudTaskIcon task={task} />
				<span className="shrink-0 text-muted-foreground">{task.slug}</span>
				<span className="min-w-0 truncate">{task.title}</span>
			</>
		),
	},
} satisfies Meta<typeof CloudWorkspaceSuggestionChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TaskTruncated: Story = {};

export const ShortProject: Story = {
	args: {
		acceptLabel: "Set this project",
		children: (
			<>
				<TaskProjectIcon color="#3b82f6" />
				<span className="min-w-0 truncate">Mobile</span>
			</>
		),
	},
};
