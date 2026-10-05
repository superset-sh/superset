import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { DashboardSidebarCloudHoverCard } from "./DashboardSidebarCloudHoverCard";

const meta = {
	component: DashboardSidebarCloudHoverCard,
	decorators: [
		(Story) => (
			<div className="w-80 rounded-md border bg-popover p-2 text-popover-foreground shadow-md">
				<Story />
			</div>
		),
	],
	args: {
		workspace: {
			name: "Cloud presence",
			createdAt: new Date("2026-09-25T10:00:00Z"),
			createdBy: {
				userId: "satya",
				name: "Satya Patel",
				image: "https://github.com/github.png",
			},
		},
		repositories: [],
		tasks: [],
		pullRequests: [],
		now: new Date("2026-09-25T12:00:00Z"),
		onOpenDetails: fn(),
		onOpenPerson: fn(),
		onOpenTask: fn(),
		onOpenPullRequest: fn(),
		onOpenRepository: fn(),
	},
} satisfies Meta<typeof DashboardSidebarCloudHoverCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Everything: Story = {
	args: {
		repositories: ["superset-sh/superset", "superset-sh/docs"],
		workspace: {
			name: "Cloud presence",
			createdAt: new Date("2026-09-25T10:00:00Z"),
			createdBy: {
				userId: "satya",
				name: "Satya Patel",
				image: "https://github.com/github.png",
			},
		},
		tasks: [
			{
				id: "task-2463",
				slug: "SUPER-2463",
				externalProvider: null,
				externalKey: null,
				title: "Cloud workspace presence in the sidebar",
				status: { type: "started", color: "#f2c94c", progressPercent: 60 },
			},
			{
				id: "task-2464",
				slug: "SUPER-2464",
				externalProvider: null,
				externalKey: null,
				title: "Only my cloud boxes in the sidebar by default",
				status: { type: "unstarted", color: "#e2e2e2", progressPercent: null },
			},
		],
		pullRequests: [
			{
				url: "https://github.com/superset-sh/superset/pull/7866",
				number: 7866,
				title: "Cloud workspace presence in the sidebar",
				state: "open",
				isDraft: true,
				additions: 412,
				deletions: 57,
			},
			{
				url: "https://github.com/superset-sh/superset/pull/7869",
				number: 7869,
				title: "AvatarStack atom with Notion-style stacking",
				state: "open",
				isDraft: false,
				additions: 96,
				deletions: 12,
			},
		],
	},
};

export const OneOfEach: Story = {
	args: {
		repositories: ["superset-sh/superset"],
		workspace: {
			name: "Environment region picker",
			createdAt: new Date("2026-09-25T07:00:00Z"),
			createdBy: {
				userId: "satya",
				name: "Satya Patel",
				image: "https://github.com/github.png",
			},
		},
		tasks: [
			{
				id: "task-2440",
				slug: "SUPER-2440",
				externalProvider: null,
				externalKey: null,
				title: "Environments pick the region nearest to the person",
				status: { type: "started", color: "#f2c94c", progressPercent: 80 },
			},
		],
		pullRequests: [
			{
				url: "https://github.com/superset-sh/superset/pull/7858",
				number: 7858,
				title: "An environment has a region, chosen nearest to the person",
				state: "open",
				isDraft: false,
				additions: 214,
				deletions: 38,
			},
		],
	},
};

export const ManyPullRequests: Story = {
	args: {
		repositories: ["superset-sh/superset"],
		workspace: {
			name: "P0-1 OAuth org scope fix",
			createdAt: new Date("2026-09-23T12:00:00Z"),
			createdBy: {
				userId: "satya",
				name: "Satya Patel",
				image: "https://github.com/github.png",
			},
		},
		tasks: [
			{
				id: "task-2401",
				slug: "SUPER-2401",
				externalProvider: null,
				externalKey: null,
				title: "A box never falls back to the org model keys",
				status: { type: "completed", color: "#5e6ad2", progressPercent: null },
			},
		],
		pullRequests: [
			{
				url: "https://github.com/superset-sh/superset/pull/7840",
				number: 7840,
				title: "A box never falls back to the organization model keys",
				state: "merged",
				isDraft: false,
				additions: 96,
				deletions: 140,
			},
			{
				url: "https://github.com/superset-sh/superset/pull/7844",
				number: 7844,
				title: "Cloud workspaces ignore environment provider keys",
				state: "merged",
				isDraft: false,
				additions: 181,
				deletions: 64,
			},
			{
				url: "https://github.com/superset-sh/superset/pull/7847",
				number: 7847,
				title: "Match the credential header by exact name",
				state: "open",
				isDraft: false,
				additions: 22,
				deletions: 9,
			},
			{
				url: "https://github.com/superset-sh/superset/pull/7839",
				number: 7839,
				title: "Try org fallback for keys (superseded)",
				state: "closed",
				isDraft: false,
				additions: 40,
				deletions: 2,
			},
			{
				url: "https://github.com/superset-sh/superset/pull/7851",
				number: 7851,
				title: "Credential rule probe cleanup",
				state: "open",
				isDraft: true,
				additions: 12,
				deletions: 30,
			},
		],
	},
};

export const SomeoneElsesBox: Story = {
	args: {
		repositories: ["superset-sh/superset"],
		workspace: {
			name: "P1-D github member authz",
			createdAt: new Date("2026-09-24T12:00:00Z"),
			createdBy: { userId: "kiet", name: "Kiet Ho", image: null },
		},
	},
};

export const NoTasks: Story = {
	args: {
		repositories: ["superset-sh/superset"],
		workspace: {
			name: "Workspace migration sync",
			createdAt: new Date("2026-09-21T12:00:00Z"),
			createdBy: {
				userId: "satya",
				name: "Satya Patel",
				image: "https://github.com/github.png",
			},
		},
		pullRequests: [
			{
				url: "https://github.com/superset-sh/superset/pull/7802",
				number: 7802,
				title: "Sync workspace migrations across hosts",
				state: "closed",
				isDraft: false,
				additions: 30,
				deletions: 4,
			},
		],
	},
};

export const ProjectsOnly: Story = {
	args: {
		repositories: ["superset-sh/superset", "superset-sh/marketing-site"],
		workspace: {
			name: "SSH device setup",
			createdAt: new Date("2026-09-19T12:00:00Z"),
			createdBy: {
				userId: "satya",
				name: "Satya Patel",
				image: "https://github.com/github.png",
			},
		},
	},
};

export const Empty: Story = {
	args: {
		workspace: {
			name: "Scratch box",
			createdAt: new Date("2026-09-25T11:50:00Z"),
			createdBy: {
				userId: "satya",
				name: "Satya Patel",
				image: "https://github.com/github.png",
			},
		},
	},
};
