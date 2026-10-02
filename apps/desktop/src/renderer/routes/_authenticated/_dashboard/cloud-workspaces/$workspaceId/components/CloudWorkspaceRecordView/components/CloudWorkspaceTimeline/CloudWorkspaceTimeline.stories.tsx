import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { CloudWorkspaceTimeline } from "./CloudWorkspaceTimeline";

const kiet = { userId: "kiet", name: "Kiet Ho", image: null };
const avi = { userId: "avi", name: "Avi Peltz", image: null };
const harshith = {
	userId: "harshith",
	name: "Harshith Mullapudi",
	image: null,
};
const satya = { userId: "satya", name: "Satya Patel", image: null };
const groomer = { userId: "groomer", name: "Groomer", image: null };
const now = new Date("2026-09-26T12:00:00Z");
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000);
const linkedTask = {
	id: "t1",
	slug: "SUPER-2311",
	externalProvider: null,
	externalKey: null,
	title: "Figure out how to get plugins and skills working in cloud boxes",
	status: { type: "started", color: "#f2c94c", progressPercent: 50 },
};
const entries = [
	{
		id: "e1",
		at: ago(240),
		actor: { kind: "user" as const, person: kiet },
		kind: "created" as const,
	},
	{
		id: "e2",
		at: ago(200),
		actor: { kind: "user" as const, person: avi },
		kind: "joined" as const,
	},
	{
		id: "e3",
		at: ago(120),
		actor: { kind: "user" as const, person: avi },
		kind: "description_edited" as const,
	},
	{
		id: "e4",
		at: ago(55),
		actor: { kind: "user" as const, person: avi },
		kind: "task_linked" as const,
		task: linkedTask,
		suggestedBy: groomer,
	},
	{
		id: "e5",
		at: ago(15),
		actor: { kind: "user" as const, person: satya },
		kind: "project_changed" as const,
		from: null,
		project: {
			id: "proj-1",
			name: "Sidebar performance",
			icon: "gauge",
			color: "#f97316",
		},
	},
	{
		id: "e6",
		at: ago(12),
		actor: { kind: "user" as const, person: harshith },
		kind: "label_added" as const,
		label: { id: "label-perf", name: "perf", color: "#ef4444" },
	},
	{
		id: "e7",
		at: ago(10),
		actor: { kind: "system" as const },
		kind: "task_linked" as const,
		task: {
			id: "t4",
			slug: "SUPER-2470",
			externalProvider: null,
			externalKey: null,
			title: "Sidebar hover lag with 40+ workspaces",
			status: { type: "unstarted", color: "#8c8c8f", progressPercent: null },
		},
		suggestedBy: null,
	},
];

const meta = {
	component: CloudWorkspaceTimeline,
	decorators: [
		(Story) => (
			<div className="w-[800px] bg-background p-6">
				<Story />
			</div>
		),
	],
	args: {
		entries,
		environmentName: "superset-dev",
		now,
		onOpenTask: fn(),
		onOpenPullRequest: fn(),
		onOpenPage: fn(),
		onOpenProject: fn(),
		onOpenLabel: fn(),
		onOpenEnvironment: fn(),
		onOpenPerson: fn(),
	},
} satisfies Meta<typeof CloudWorkspaceTimeline>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Busy: Story = {};

export const JustCreated: Story = {
	args: { entries: entries.slice(0, 1) },
};
