import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { CloudWorkspaceRecordSide } from "./CloudWorkspaceRecordSide";

const kiet = { userId: "kiet", name: "Kiet Ho", image: null };
const avi = { userId: "avi", name: "Avi Peltz", image: null };
const harshith = {
	userId: "harshith",
	name: "Harshith Mullapudi",
	image: null,
};
const satya = { userId: "satya", name: "Satya Patel", image: null };
const now = new Date("2026-09-26T12:00:00Z");
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000);

const meta = {
	component: CloudWorkspaceRecordSide,
	parameters: { layout: "fullscreen" },
	decorators: [
		(Story) => (
			<div className="flex h-screen justify-end bg-background">
				<Story />
			</div>
		),
	],
	args: {
		workspace: {
			id: "lag-repro-01",
			name: "lag-repro-01",
			status: "ready",
			agentStatus: "working",
			agentStatusAt: ago(2),
			createdAt: ago(240),
			createdBy: avi,
			archivedAt: null,
			project: {
				id: "proj-1",
				name: "Sidebar performance",
				icon: "gauge",
				color: "#f97316",
			},
			labels: [],
			environmentName: "superset-dev",
			repositories: [
				{ fullName: "superset-sh/superset", branch: "superset/lag-repro-01" },
				{ fullName: "superset-sh/docs", branch: "superset/lag-repro-01" },
			],
			presence: [
				{ ...kiet, lastSeenAt: ago(1) },
				{ ...harshith, lastSeenAt: ago(2) },
				{ ...satya, lastSeenAt: ago(120) },
			],
			prompt: null,
			description: null,
			visibility: "org",
		},
		tasks: [
			{
				id: "t1",
				slug: "SUPER-2311",
				externalProvider: null,
				externalKey: null,
				title:
					"Figure out how to get plugins and skills working in cloud boxes",
				status: { type: "started", color: "#f2c94c", progressPercent: 50 },
			},
			{
				id: "t2",
				slug: "SUPER-2470",
				externalProvider: null,
				externalKey: null,
				title: "Sidebar hover lag with 40+ workspaces",
				status: { type: "unstarted", color: "#8c8c8f", progressPercent: null },
			},
		],
		pullRequests: [
			{
				url: "https://github.com/superset-sh/superset/pull/7855",
				number: 7855,
				title: "Sidebar: memoize hover measurement",
				state: "open",
				isDraft: false,
				additions: 84,
				deletions: 31,
			},
		],
		pages: [
			{
				id: "p1",
				title: "Sidebar lag: before/after trace",
				thumbnailUrl: "fixtures/thumb-trace.jpg",
				createdAt: ago(40),
				updatedAt: ago(40),
			},
			{
				id: "p2",
				title: "Hover provider re-measure notes",
				thumbnailUrl: "fixtures/thumb-notes.jpg",
				createdAt: ago(180),
				updatedAt: ago(120),
			},
		],
		projects: [
			{
				id: "proj-1",
				name: "Sidebar performance",
				icon: "gauge",
				color: "#f97316",
			},
			{ id: "proj-2", name: "Cloud workspaces", icon: null, color: "#3b82f6" },
		],
		now,
		onOpenRepository: fn(),
		onOpenTask: fn(),
		onUnlinkTask: fn(),
		onOpenPullRequest: fn(),
		onOpenPage: fn(),
		onOpenPerson: fn(),
		onSetProject: fn(),
		onCreateProject: fn(),
		labels: [
			{ id: "label-perf", name: "perf", color: "#ef4444" },
			{ id: "label-sidebar", name: "sidebar", color: "#3b82f6" },
		],
		knownLabels: [
			{ id: "label-perf", name: "perf", color: "#ef4444" },
			{ id: "label-sidebar", name: "sidebar", color: "#3b82f6" },
			{ id: "label-mobile", name: "mobile", color: "#a855f7" },
		],
		onAddLabel: fn(),
		onRemoveLabel: fn(),
		onOpenEnvironment: fn(),
	},
} satisfies Meta<typeof CloudWorkspaceRecordSide>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Everything: Story = {};

export const JustCreated: Story = {
	args: {
		workspace: {
			...meta.args.workspace,
			createdBy: kiet,
			project: null,
			repositories: meta.args.workspace.repositories.slice(0, 1),
		},
		tasks: [],
		pullRequests: [],
		pages: [],
		labels: [],
	},
};
