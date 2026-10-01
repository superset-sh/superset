import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { DashboardSidebarCloudRow } from "../DashboardSidebarCloudRow";
import { DashboardSidebarCloudGroup } from "./DashboardSidebarCloudGroup";

const now = new Date("2026-09-25T12:00:00Z");

function Row({ name }: { name: string }) {
	return (
		<DashboardSidebarCloudRow
			workspace={{
				name,
				createdBy: {
					userId: "satya",
					name: "Satya Patel",
					image: "https://github.com/github.png",
				},
				status: "ready",
				agentStatus: null,
				agentStatusAt: new Date("2026-09-25T11:55:00Z"),
				createdAt: new Date("2026-09-25T09:00:00Z"),
			}}
			isMine
			isRead
			repo={{ name: "superset", iconUrl: "https://github.com/superset-sh.png" }}
			ports={null}
			pullRequest={null}
			now={now}
			onOpen={fn()}
			onOpenPullRequest={fn()}
			onArchive={fn()}
		/>
	);
}

const meta = {
	component: DashboardSidebarCloudGroup,
	decorators: [
		(Story) => (
			<div className="w-[300px] rounded-lg bg-sidebar py-2 dark:bg-muted/35">
				<Story />
			</div>
		),
	],
	args: {
		group: {
			id: "group-1",
			name: "Launch week",
			createdAt: 0,
			isCollapsed: false,
		},
		organizationId: "org-storybook",
		startRenaming: false,
		onRenameStarted: fn(),
		children: (
			<>
				<Row name="Cloud presence" />
				<Row name="Environment region picker" />
			</>
		),
	},
} satisfies Meta<typeof DashboardSidebarCloudGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Expanded: Story = {};

export const Collapsed: Story = {
	args: { group: { ...meta.args.group, isCollapsed: true } },
};

export const Empty: Story = {
	args: { children: null },
};

export const ManyWorkspaces: Story = {
	args: {
		children: (
			<>
				<Row name="Cloud presence" />
				<Row name="Environment region picker" />
				<Row name="Auto-login for Neon branches" />
				<Row name="Superset PR #7851 review" />
				<Row name="P0-1 OAuth org scope fix" />
				<Row name="Workspace migration sync" />
			</>
		),
	},
};

export const LongName: Story = {
	args: {
		group: {
			...meta.args.group,
			name: "Everything we promised to ship before the October launch",
		},
	},
};
