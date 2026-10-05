import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { CloudWorkspacesHeader } from "./CloudWorkspacesHeader";

const meta = {
	component: CloudWorkspacesHeader,
	decorators: [
		(Story) => (
			<div className="w-[900px] rounded-lg border bg-background">
				<Story />
			</div>
		),
	],
	args: {
		people: [
			{
				userId: "satya",
				name: "Satya Patel",
				image: "https://github.com/github.png",
			},
			{ userId: "avi", name: "Avi Peltz", image: null },
			{ userId: "kiet", name: "Kiet Ho", image: null },
		],
		personIds: [],
		projects: [
			{
				id: "p1",
				name: "Sidebar performance",
				icon: "gauge",
				color: "#f97316",
			},
			{ id: "p2", name: "Cloud workspaces", icon: "cloud", color: "#3b82f6" },
		],
		projectIds: [],
		status: ["active"],
		sort: "activity",
		groupBy: "none",
		query: "",
		onPeopleChange: fn(),
		onProjectsChange: fn(),
		labels: [
			{ id: "l1", name: "bug", color: "#ef4444" },
			{ id: "l2", name: "verified", color: "#a855f7" },
		],
		labelIds: [],
		onLabelsChange: fn(),
		onStatusChange: fn(),
		onClearFilters: fn(),
		onSortChange: fn(),
		onGroupByChange: fn(),
		onQueryChange: fn(),
	},
} satisfies Meta<typeof CloudWorkspacesHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Everyone: Story = {};

export const FilteredToPerson: Story = {
	args: { personIds: ["kiet"] },
};

export const FilteredToProject: Story = {
	args: { projectIds: ["p2", "none"] },
};

export const FiltersSetSortedByCreatedGroupedByPerson: Story = {
	args: {
		personIds: ["avi", "kiet"],
		status: ["active", "archived"],
		sort: "created",
		groupBy: "person",
	},
};

export const WithSearch: Story = {
	args: { query: "presence" },
};
