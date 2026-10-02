import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn, userEvent, within } from "storybook/test";
import { DashboardSidebarCloudRow } from "../DashboardSidebarCloudRow";
import { DashboardSidebarCloudContextMenu } from "./DashboardSidebarCloudContextMenu";

const meta = {
	component: DashboardSidebarCloudContextMenu,
	decorators: [
		(Story) => (
			<div className="h-[440px] w-[300px] rounded-lg bg-sidebar py-2 dark:bg-muted/35">
				<Story />
			</div>
		),
	],
	args: {
		isUnread: false,
		projectId: "cloud",
		projects: [
			{ id: "cloud", name: "Cloud workspaces", icon: null, color: "#db2777" },
			{ id: "mobile", name: "Mobile polish", icon: null, color: "#ea580c" },
		],
		linkedTaskIds: new Set<string>(),
		onSetProject: fn(),
		onToggleTask: fn(),
		labels: [{ id: "verified", name: "verified", color: "#a855f7" }],
		knownLabels: [
			{ id: "verified", name: "verified", color: "#a855f7" },
			{ id: "blocked", name: "blocked", color: "#ef4444" },
		],
		onAddLabel: fn(),
		onRemoveLabel: fn(),
		groups: [],
		groupId: null,
		archiveShortcut: "⌘⇧⌫",
		onOpenDetails: fn(),
		onRename: fn(),
		onSaveAsEnvironment: fn(),
		onCopyLink: fn(),
		onCopyWorkspaceId: fn(),
		onToggleUnread: fn(),
		onCreateGroup: fn(),
		onMoveToGroup: fn(),
		onHideFromSidebar: fn(),
		onArchive: fn(),
		children: (
			<DashboardSidebarCloudRow
				workspace={{
					name: "Auto-login for Neon branches",
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
				repo={{
					name: "superset",
					iconUrl: "https://github.com/superset-sh.png",
				}}
				ports={null}
				pullRequest={null}
				now={new Date("2026-09-25T12:00:00Z")}
				onOpen={fn()}
				onOpenPullRequest={fn()}
				onArchive={fn()}
			/>
		),
	},
	play: async ({ canvasElement }) => {
		const name = within(canvasElement).getByText(
			"Auto-login for Neon branches",
		);
		const { left, top, height } = name.getBoundingClientRect();
		await userEvent.pointer({
			keys: "[MouseRight]",
			target: name,
			coords: { clientX: left + 40, clientY: top + height / 2 },
		});
	},
} satisfies Meta<typeof DashboardSidebarCloudContextMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Unread: Story = {
	args: { isUnread: true },
};

export const WithGroups: Story = {
	args: {
		groups: [
			{ id: "group-reviews", name: "Reviews" },
			{ id: "group-infra", name: "Infra" },
		],
	},
};

export const InAGroup: Story = {
	args: {
		groups: [
			{ id: "group-reviews", name: "Reviews" },
			{ id: "group-infra", name: "Infra" },
		],
		groupId: "group-reviews",
	},
};

export const WithPorts: Story = {
	args: { onCloseAllPorts: fn() },
};

export const ClosingPorts: Story = {
	args: { onCloseAllPorts: fn(), isClosingPorts: true },
};

export const Minimal: Story = {
	args: {
		onRename: undefined,
		onSaveAsEnvironment: undefined,
		onArchive: undefined,
	},
};

export const Everything: Story = {
	args: {
		isUnread: true,
		groups: [
			{ id: "group-reviews", name: "Reviews" },
			{ id: "group-infra", name: "Infra" },
		],
		groupId: "group-reviews",
		onCloseAllPorts: fn(),
	},
};
