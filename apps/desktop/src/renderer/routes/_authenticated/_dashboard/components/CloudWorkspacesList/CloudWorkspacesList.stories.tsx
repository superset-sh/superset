import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import {
	type CloudWorkspaceGroup,
	CloudWorkspacesList,
} from "./CloudWorkspacesList";

const GROUPS: CloudWorkspaceGroup[] = [
	{
		key: "satya",
		label: "Satya Patel",
		person: {
			userId: "satya",
			name: "Satya Patel",
			image: "https://github.com/github.png",
		},
		items: [
			{
				workspace: {
					id: "cloud-presence",
					name: "Cloud presence",
					presence: [
						{
							userId: "satya",
							name: "Satya Patel",
							image: "https://github.com/github.png",
							lastSeenAt: new Date("2026-09-25T11:59:00Z"),
						},
					],
					status: "ready",
					agentStatus: "working",
					agentStatusAt: new Date("2026-09-25T11:58:00Z"),
					createdAt: new Date("2026-09-25T09:00:00Z"),
					createdBy: {
						userId: "satya",
						name: "Satya Patel",
						image: "https://github.com/github.png",
					},
				},
				repos: ["superset-sh/superset", "superset-sh/docs"],
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
				isInSidebar: true,
				isMine: true,
				showsPresence: true,
				isRead: true,
			},
			{
				workspace: {
					id: "region-picker",
					name: "Environment region picker",
					presence: [],
					status: "ready",
					agentStatus: "review",
					agentStatusAt: new Date("2026-09-25T11:30:00Z"),
					createdAt: new Date("2026-09-25T07:00:00Z"),
					createdBy: {
						userId: "satya",
						name: "Satya Patel",
						image: "https://github.com/github.png",
					},
				},
				repos: ["superset-sh/superset"],
				pullRequests: [
					{
						url: "https://github.com/superset-sh/superset/pull/7858",
						number: 7858,
						title: "An environment has a region, chosen nearest to the person",
						state: "merged",
						isDraft: false,
						additions: 214,
						deletions: 38,
					},
				],
				isInSidebar: true,
				isMine: true,
				showsPresence: true,
				isRead: false,
			},
		],
	},
	{
		key: "kiet",
		label: "Kiet Ho",
		person: { userId: "kiet", name: "Kiet Ho", image: null },
		items: [
			{
				workspace: {
					id: "member-authz",
					name: "P1-D github member authz",
					presence: [
						{
							userId: "kiet",
							name: "Kiet Ho",
							image: null,
							lastSeenAt: new Date("2026-09-25T11:57:00Z"),
						},
						{
							userId: "avi",
							name: "Avi Peltz",
							image: null,
							lastSeenAt: new Date("2026-09-25T09:00:00Z"),
						},
					],
					status: "ready",
					agentStatus: "permission",
					agentStatusAt: new Date("2026-09-25T11:56:00Z"),
					createdAt: new Date("2026-09-24T12:00:00Z"),
					createdBy: { userId: "kiet", name: "Kiet Ho", image: null },
				},
				repos: ["superset-sh/superset"],
				pullRequests: [],
				isInSidebar: false,
				isMine: false,
				showsPresence: true,
				isRead: true,
			},
			{
				workspace: {
					id: "migration-sync",
					name: "Workspace migration sync",
					presence: [],
					status: "failed",
					agentStatus: null,
					agentStatusAt: null,
					createdAt: new Date("2026-09-21T12:00:00Z"),
					createdBy: { userId: "kiet", name: "Kiet Ho", image: null },
				},
				repos: ["superset-sh/superset"],
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
				isInSidebar: false,
				isMine: false,
				showsPresence: true,
				isRead: true,
			},
		],
	},
];

const meta = {
	component: CloudWorkspacesList,
	decorators: [
		(Story) => (
			<div className="w-[900px] rounded-lg border bg-background">
				<Story />
			</div>
		),
	],
	args: {
		now: new Date("2026-09-25T12:00:00Z"),
		onOpen: fn(),
		onOpenPullRequest: fn(),
		onOpenRepo: fn(),
		onSetInSidebar: fn(),
		onUnarchive: fn(),
	},
} satisfies Meta<typeof CloudWorkspacesList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Recent: Story = {
	args: { content: { items: GROUPS.flatMap((group) => group.items) } },
};

export const GroupedByTime: Story = {
	args: {
		content: {
			groups: [
				{
					key: "today",
					label: "Today",
					items: GROUPS.flatMap((group) => group.items).slice(0, 3),
				},
				{
					key: "3 days ago",
					label: "3 days ago",
					items: GROUPS.flatMap((group) => group.items).slice(3),
				},
			],
		},
	},
};

export const GroupedByPerson: Story = {
	args: { content: { groups: GROUPS } },
};

export const Empty: Story = {
	args: { content: { items: [] } },
};

const ALL_ITEMS = GROUPS.flatMap((group) => group.items);

export const WithArchived: Story = {
	args: {
		content: {
			items: [
				ALL_ITEMS[0],
				...ALL_ITEMS.slice(1, 3).map((item) => ({
					...item,
					workspace: { ...item.workspace, status: "archived" as const },
				})),
				...ALL_ITEMS.slice(3),
			],
		},
	},
};
