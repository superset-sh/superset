import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ProjectPicker } from "./ProjectPicker";

const projects = [
	{
		id: "proj-1",
		name: "Sidebar performance",
		icon: "gauge",
		color: "#f97316",
	},
	{ id: "proj-2", name: "Cloud workspaces", icon: null, color: "#3b82f6" },
	{ id: "proj-3", name: "Mobile", icon: null, color: "#a855f7" },
];

const meta = {
	component: ProjectPicker,
	decorators: [
		(Story) => (
			<div className="w-[372px] text-[13px] bg-background p-6">
				<Story />
			</div>
		),
	],
	args: {
		project: null,
		projects,
		onSetProject: fn(),
		onCreateProject: fn(),
	},
} satisfies Meta<typeof ProjectPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoProject: Story = {};

export const WithProject: Story = { args: { project: projects[0] } };

export const NoProjectsYet: Story = { args: { projects: [] } };
