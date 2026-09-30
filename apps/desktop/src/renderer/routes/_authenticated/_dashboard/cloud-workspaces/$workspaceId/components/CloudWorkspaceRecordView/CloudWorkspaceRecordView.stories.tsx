import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { CloudWorkspaceRecordView } from "./CloudWorkspaceRecordView";

const kiet = { userId: "kiet", name: "Kiet Ho", image: null };
const harshith = {
	userId: "harshith",
	name: "Harshith Mullapudi",
	image: null,
};
const satya = { userId: "satya", name: "Satya Patel", image: null };
const avi = { userId: "avi", name: "Avi Peltz", image: null };
const groomer = { userId: "groomer", name: "Groomer", image: null };
const now = new Date("2026-09-26T12:00:00Z");
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000);

const meta = {
	component: CloudWorkspaceRecordView,
	parameters: { layout: "fullscreen" },
	decorators: [
		(Story) => (
			<div className="fixed inset-0 bg-background">
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
			createdAt: ago(2),
			createdBy: kiet,
			deletedAt: null,
			project: null,
			labels: [
				{ id: "label-perf", name: "perf", color: "#ef4444" },
				{ id: "label-sidebar", name: "sidebar", color: "#3b82f6" },
				{ id: "label-needs-review", name: "needs-review", color: null },
			],
			environmentName: "superset-dev",
			repositories: [
				{ fullName: "superset-sh/superset", branch: "superset/lag-repro-01" },
			],
			presence: [
				{ ...avi, lastSeenAt: ago(3) },
				{ ...kiet, lastSeenAt: ago(1) },
				{ ...harshith, lastSeenAt: ago(2) },
				{ ...satya, lastSeenAt: ago(120) },
			],
			prompt:
				"Reproduce the sidebar lag Harshith reported when 40+ workspaces are open. Profile the renderer, find the hot path, and open a PR with the fix and a before/after trace.",
			visibility: "org",
			description: [
				"Harshith reported the sidebar lagging with 40+ workspaces open. Reproduced at 48: every `mousemove` over the list made the hover provider re-measure every row, so frame time sat at 38ms while the pointer moved.",
				"",
				"#### What changed",
				"",
				"- Row measurement is memoized and only recomputed from a `ResizeObserver`, not on pointer events.",
				"- The hover card reads the cached rect; nothing else in the provider changed.",
				"- Frame time 38ms → 6ms in the trace with 48 workspaces; 60 is still being profiled.",
				"",
				"#### Where it stands",
				"",
				"- [#7855 Sidebar: memoize hover measurement](https://github.com/superset-sh/superset/pull/7855) is open, checks passing, two review comments outstanding.",
				"- Avi is addressing the review comments; the profiler run at 60 workspaces is next.",
			].join("\n"),
		},
		tasks: [
			{
				id: "t1",
				slug: "SUPER-2311",
				title:
					"Figure out how to get plugins and skills working in cloud boxes",
				status: { type: "started", color: "#f2c94c", progressPercent: 50 },
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
			{ id: "proj-3", name: "Mobile", icon: null, color: "#a855f7" },
		],
		knownLabels: [
			{ id: "label-perf", name: "perf", color: "#ef4444" },
			{ id: "label-sidebar", name: "sidebar", color: "#3b82f6" },
			{ id: "label-needs-review", name: "needs-review", color: null },
			{ id: "label-billing", name: "billing", color: "#22c55e" },
			{ id: "label-mobile", name: "mobile", color: "#a855f7" },
		],
		suggestions: [
			{
				id: "s-label",
				source: "groomer",
				kind: "add_label",
				label: {
					id: "label-performance",
					name: "performance",
					color: "#f97316",
				},
			},
			{
				id: "s0",
				source: "groomer",
				kind: "set_project",
				project: {
					id: "proj-1",
					name: "Sidebar performance",
					icon: "gauge",
					color: "#f97316",
				},
			},
			{
				id: "s1",
				source: "groomer",
				kind: "link_task",
				task: {
					id: "t2",
					slug: "SUPER-2384",
					title: "Mobile: block comment popover on small screens",
					status: { type: "started", color: "#f2c94c", progressPercent: 50 },
				},
			},
			{
				id: "s2",
				source: "groomer",
				kind: "link_task",
				task: {
					id: "t3",
					slug: "SUPER-2452",
					title: "No mechanism for reporting sidebar lag",
					status: {
						type: "unstarted",
						color: "#8c8c8f",
						progressPercent: null,
					},
				},
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
			{
				id: "p3",
				title: "Renderer profile, run 3",
				thumbnailUrl: null,
				createdAt: ago(180),
				updatedAt: ago(180),
			},
			{
				id: "p4",
				title: "Repro steps",
				thumbnailUrl: null,
				createdAt: ago(240),
				updatedAt: ago(240),
			},
		],
		attachments: [
			{
				id: "a1",
				name: "before-after.mp4",
				contentType: "video/mp4",
				url: null,
				createdAt: ago(240),
			},
			{
				id: "a2",
				name: "trace-48-workspaces.json",
				contentType: "application/json",
				url: null,
				createdAt: ago(240),
			},
			{
				id: "a3",
				name: "sidebar-lag.png",
				contentType: "image/png",
				url: "fixtures/thumb-trace.jpg",
				createdAt: ago(60),
			},
		],
		timeline: [
			{
				id: "e1",
				at: ago(240),
				actor: { kind: "user", person: kiet },
				kind: "created",
			},
			{
				id: "e2",
				at: ago(200),
				actor: { kind: "user", person: avi },
				kind: "joined",
			},
			{
				id: "e3",
				at: ago(180),
				actor: { kind: "user", person: harshith },
				kind: "joined",
			},
			{
				id: "e4",
				at: ago(120),
				actor: { kind: "user", person: kiet },
				kind: "description_edited",
			},
			{
				id: "e5",
				at: ago(60),
				actor: { kind: "user", person: avi },
				kind: "pull_request_opened",
				pullRequest: {
					url: "https://github.com/superset-sh/superset/pull/7855",
					number: 7855,
					title: "Sidebar: memoize hover measurement",
					state: "open",
					isDraft: false,
					additions: 84,
					deletions: 31,
				},
			},
			{
				id: "e6",
				at: ago(55),
				actor: { kind: "user", person: avi },
				kind: "task_linked",
				task: {
					id: "t1",
					slug: "SUPER-2311",
					title:
						"Figure out how to get plugins and skills working in cloud boxes",
					status: { type: "started", color: "#f2c94c", progressPercent: 50 },
				},
				suggestedBy: groomer,
			},
			{
				id: "e7",
				at: ago(40),
				actor: { kind: "user", person: avi },
				kind: "page_published",
				page: { id: "p1", title: "sidebar-lag-trace-8fk2ha" },
			},
			{
				id: "e8",
				at: ago(20),
				actor: { kind: "user", person: kiet },
				kind: "renamed",
				from: "lag repro",
				to: "lag-repro-01",
			},
			{
				id: "e9",
				at: ago(10),
				actor: { kind: "system" },
				kind: "task_linked",
				task: {
					id: "t4",
					slug: "SUPER-2470",
					title: "Sidebar hover lag with 40+ workspaces",
					status: {
						type: "unstarted",
						color: "#8c8c8f",
						progressPercent: null,
					},
				},
				suggestedBy: null,
			},
		],
		now,
		isGeneratingDescription: false,
		canEditSharing: true,
		viewerId: "satya",
		onBack: fn(),
		onOpenWorkspace: fn(),
		onOpenPerson: fn(),
		onRename: fn(),
		onAddLabel: fn(),
		onRemoveLabel: fn(),
		onSetProject: fn(),
		onCreateProject: fn(),
		onUnlinkTask: fn(),
		onOpenEnvironment: fn(),
		onOpenRepository: fn(),
		onOpenTask: fn(),
		onAcceptSuggestion: fn(),
		onDismissSuggestion: fn(),
		onOpenPullRequest: fn(),
		onOpenPage: fn(),
		onOpenProject: fn(),
		onOpenLabel: fn(),
		onOpenAttachment: fn(),
		onDownloadAttachment: fn(async () => {}),
		onGenerateDescription: fn(),
		onSaveDescription: fn(),
		onSetVisibility: fn(async () => {}),
		onCopyLink: fn(),
		onCopyId: fn(),
		onArchive: fn(),
		onUnarchive: fn(),
	},
} satisfies Meta<typeof CloudWorkspaceRecordView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LongDescription: Story = {};

export const ShortDescription: Story = {
	args: {
		workspace: {
			...meta.args.workspace,
			labels: [],
			description:
				"Memoized the hover measurement; frame time 38ms → 6ms. PR #7855 is open.",
		},
		suggestions: [],
		pages: [],
		attachments: [],
		timeline: meta.args.timeline.slice(0, 4),
	},
};

export const JustCreated: Story = {
	args: {
		workspace: {
			...meta.args.workspace,
			status: "provisioning",
			agentStatus: null,
			createdAt: ago(0),
			presence: [],
			description: null,
			labels: [],
			project: null,
		},
		tasks: [],
		suggestions: [],
		pullRequests: [],
		pages: [],
		attachments: meta.args.attachments.slice(0, 2),
		timeline: [{ ...meta.args.timeline[0], at: ago(0) }],
	},
};

export const Archived: Story = {
	args: {
		workspace: {
			...meta.args.workspace,
			agentStatus: null,
			deletedAt: ago(3 * 24 * 60),
		},
		suggestions: [],
		timeline: [
			...meta.args.timeline,
			{
				id: "e10",
				at: ago(3 * 24 * 60),
				actor: { kind: "user", person: kiet },
				kind: "archived",
			},
		],
	},
};
