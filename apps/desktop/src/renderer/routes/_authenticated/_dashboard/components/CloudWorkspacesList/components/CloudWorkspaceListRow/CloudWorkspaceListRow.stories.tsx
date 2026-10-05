import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { CloudWorkspaceListRow } from "./CloudWorkspaceListRow";

const meta = {
	component: CloudWorkspaceListRow,
	decorators: [
		(Story) => (
			<div className="w-[880px] bg-background p-6">
				<table className="w-full">
					<tbody>
						<Story />
					</tbody>
				</table>
			</div>
		),
	],
	args: {
		item: {
			workspace: {
				id: "ws-1",
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
				agentStatus: null,
				agentStatusAt: new Date("2026-09-25T11:55:00Z"),
				createdAt: new Date("2026-09-25T09:00:00Z"),
				createdBy: {
					userId: "satya",
					name: "Satya Patel",
					image: "https://github.com/github.png",
				},
			},
			repos: ["superset-sh/superset"],
			pullRequests: [
				{
					url: "https://github.com/superset-sh/superset/pull/7866",
					number: 7866,
					title: "Cloud workspace presence in the sidebar",
					state: "open",
					isDraft: false,
					additions: 412,
					deletions: 57,
				},
			],
			isInSidebar: true,
			isMine: false,
			isRead: true,
			showsPresence: true,
		},
		now: new Date("2026-09-25T12:00:00Z"),
		onOpen: fn(),
		onOpenPullRequest: fn(),
		onOpenRepo: fn(),
		onSetInSidebar: fn(),
		showCreator: false,
	},
} satisfies Meta<typeof CloudWorkspaceListRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InSidebar: Story = {};

export const WithCreator: Story = {
	args: { showCreator: true },
};

export const NotInSidebar: Story = {
	args: { item: { ...meta.args.item, isInSidebar: false } },
};

export const Working: Story = {
	args: {
		item: {
			...meta.args.item,
			workspace: {
				...meta.args.item.workspace,
				agentStatus: "working",
				agentStatusAt: new Date("2026-09-25T11:58:00Z"),
			},
		},
	},
};

export const Creating: Story = {
	args: {
		item: {
			...meta.args.item,
			workspace: {
				...meta.args.item.workspace,
				status: "provisioning",
				agentStatusAt: null,
			},
			pullRequests: [],
		},
	},
};

export const NoReposOrPullRequests: Story = {
	args: { item: { ...meta.args.item, repos: [], pullRequests: [] } },
};

export const ManyReposAndPullRequests: Story = {
	args: {
		item: {
			...meta.args.item,
			repos: [
				"superset-sh/superset",
				"superset-sh/docs",
				"superset-sh/marketing-site",
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
					state: "open",
					isDraft: false,
					additions: 181,
					deletions: 64,
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
	},
};

export const ManyPeople: Story = {
	args: {
		item: {
			...meta.args.item,
			workspace: {
				...meta.args.item.workspace,
				presence: [
					{
						userId: "satya",
						name: "Satya Patel",
						image: "https://github.com/github.png",
						lastSeenAt: new Date("2026-09-25T11:59:00Z"),
					},
					{
						userId: "kiet",
						name: "Kiet Ho",
						image: null,
						lastSeenAt: new Date("2026-09-25T11:55:00Z"),
					},
					{
						userId: "avi",
						name: "Avi Peltz",
						image: null,
						lastSeenAt: new Date("2026-09-24T12:00:00Z"),
					},
					{
						userId: "harshith",
						name: "Harshith Mullapudi",
						image: null,
						lastSeenAt: new Date("2026-09-23T12:00:00Z"),
					},
				],
			},
		},
	},
};

export const LongName: Story = {
	args: {
		item: {
			...meta.args.item,
			workspace: {
				...meta.args.item.workspace,
				name: "Migrate every sandbox from Blaxel to Vercel and keep the goldens warm across regions",
			},
			repos: ["superset-sh/superset", "superset-sh/docs"],
		},
	},
};

export const Unread: Story = {
	args: {
		item: {
			...meta.args.item,
			workspace: {
				...meta.args.item.workspace,
				agentStatus: "review",
				agentStatusAt: new Date("2026-09-25T11:50:00Z"),
			},
			isRead: false,
		},
	},
};

export const Mine: Story = {
	args: { item: { ...meta.args.item, isMine: true } },
};
