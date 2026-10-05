import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ProjectsHeader } from "./ProjectsHeader";

const satya = { id: "satya", name: "Satya Patel", image: null };
const project = {
	icon: null,
	color: null,
	targetDate: null,
	createdAt: new Date("2026-09-20T12:00:00Z"),
	workspaceCount: 0,
	taskCount: 0,
	lead: { userId: "satya", name: "Satya Patel", image: null },
};

const meta = {
	component: ProjectsHeader,
	parameters: { layout: "fullscreen" },
	decorators: [
		(Story) => (
			<div className="w-full bg-background">
				<Story />
			</div>
		),
	],
	args: {
		query: "",
		projects: [
			{ ...project, id: "p1", name: "Mobile polish", state: "started" },
			{ ...project, id: "p2", name: "Cloud workspaces", state: "planned" },
		],
		people: [satya],
		status: [],
		leads: [],
		onQueryChange: fn(),
		onStatusChange: fn(),
		onLeadsChange: fn(),
		sort: "status",
		onSortChange: fn(),
		onClearFilters: fn(),
		onNewProject: fn(),
	},
} satisfies Meta<typeof ProjectsHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoFilters: Story = {};

export const Filtered: Story = {
	args: { status: ["started", "planned"], leads: ["satya"] },
};
