import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { DashboardSidebarPortsCard } from "../DashboardSidebarPortsCard";
import { DashboardSidebarCloudRow } from "./DashboardSidebarCloudRow";

const meta = {
	component: DashboardSidebarCloudRow,
	decorators: [
		(Story) => (
			<div className="w-[300px] rounded-lg bg-sidebar py-2 dark:bg-muted/35">
				<Story />
			</div>
		),
	],
	args: {
		workspace: {
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
		},
		isMine: true,
		isRead: true,
		repo: { name: "superset", iconUrl: "https://github.com/superset-sh.png" },
		ports: null,
		pullRequest: null,
		now: new Date("2026-09-25T12:00:00Z"),
		onOpen: fn(),
		onOpenPullRequest: fn(),
		onArchive: fn(),
	},
} satisfies Meta<typeof DashboardSidebarCloudRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {};

export const Creating: Story = {
	args: {
		workspace: {
			name: "Auto-login for Neon branches",
			createdBy: {
				userId: "satya",
				name: "Satya Patel",
				image: "https://github.com/github.png",
			},
			status: "provisioning",
			agentStatus: null,
			agentStatusAt: null,
			createdAt: new Date("2026-09-25T11:59:50Z"),
		},
	},
};

export const Working: Story = {
	args: {
		workspace: {
			name: "Auto-login for Neon branches",
			createdBy: {
				userId: "satya",
				name: "Satya Patel",
				image: "https://github.com/github.png",
			},
			status: "ready",
			agentStatus: "working",
			agentStatusAt: new Date("2026-09-25T11:58:00Z"),
			createdAt: new Date("2026-09-25T09:00:00Z"),
		},
	},
};

export const NeedsYou: Story = {
	args: {
		workspace: {
			name: "Auto-login for Neon branches",
			createdBy: {
				userId: "satya",
				name: "Satya Patel",
				image: "https://github.com/github.png",
			},
			status: "ready",
			agentStatus: "permission",
			agentStatusAt: new Date("2026-09-25T11:57:00Z"),
			createdAt: new Date("2026-09-25T09:00:00Z"),
		},
	},
};

export const Done: Story = {
	args: {
		workspace: {
			name: "Auto-login for Neon branches",
			createdBy: {
				userId: "satya",
				name: "Satya Patel",
				image: "https://github.com/github.png",
			},
			status: "ready",
			agentStatus: "review",
			agentStatusAt: new Date("2026-09-25T11:50:00Z"),
			createdAt: new Date("2026-09-25T09:00:00Z"),
		},
		isRead: false,
	},
};

export const AgentFailed: Story = {
	args: {
		workspace: {
			name: "Auto-login for Neon branches",
			createdBy: {
				userId: "satya",
				name: "Satya Patel",
				image: "https://github.com/github.png",
			},
			status: "ready",
			agentStatus: "failed",
			agentStatusAt: new Date("2026-09-25T11:40:00Z"),
			createdAt: new Date("2026-09-25T09:00:00Z"),
		},
	},
};

export const SandboxFailed: Story = {
	args: {
		workspace: {
			name: "Auto-login for Neon branches",
			createdBy: {
				userId: "satya",
				name: "Satya Patel",
				image: "https://github.com/github.png",
			},
			status: "failed",
			agentStatus: null,
			agentStatusAt: null,
			createdAt: new Date("2026-09-25T09:00:00Z"),
		},
	},
};

export const Selected: Story = {
	args: { isActive: true },
};

export const SomeoneElsesBox: Story = {
	args: {
		workspace: {
			name: "Auto-login for Neon branches",
			createdBy: { userId: "kiet", name: "Kiet Ho", image: null },
			status: "ready",
			agentStatus: null,
			agentStatusAt: new Date("2026-09-25T11:55:00Z"),
			createdAt: new Date("2026-09-25T09:00:00Z"),
		},
		isMine: false,
	},
};

export const WithPullRequest: Story = {
	args: { pullRequest: { number: 7863, state: "open", isDraft: false } },
};

export const WithPorts: Story = {
	args: {
		ports: {
			count: 2,
			card: (
				<DashboardSidebarPortsCard
					ports={[
						{
							port: 3000,
							label: "Frontend",
							hostType: "remote-device",
							forward: { status: { state: "active", localPort: 3000 } },
						},
						{
							port: 3001,
							label: "API",
							hostType: "remote-device",
							forward: { status: { state: "active", localPort: 3011 } },
						},
					]}
					onOpenPort={fn()}
					onClosePort={fn()}
					onCloseAll={fn()}
				/>
			),
		},
	},
};

export const TwelvePorts: Story = {
	args: {
		ports: {
			count: 12,
			card: (
				<DashboardSidebarPortsCard
					ports={[
						{
							port: 3000,
							label: "Frontend",
							hostType: "remote-device",
							forward: { status: { state: "active", localPort: 3000 } },
						},
						{
							port: 3001,
							label: "API",
							hostType: "remote-device",
							forward: { status: { state: "active", localPort: 3001 } },
						},
						{
							port: 3002,
							label: "Docs",
							hostType: "remote-device",
							forward: { status: { state: "active", localPort: 3002 } },
						},
						{
							port: 6006,
							label: "Storybook",
							hostType: "remote-device",
							forward: { status: { state: "active", localPort: 6006 } },
						},
						{
							port: 5173,
							label: "Vite",
							hostType: "remote-device",
							forward: { status: { state: "active", localPort: 5173 } },
						},
						{
							port: 5432,
							label: "Postgres",
							hostType: "remote-device",
							forward: { status: { state: "active", localPort: 5432 } },
						},
						{
							port: 6379,
							label: "Redis",
							hostType: "remote-device",
							forward: { status: { state: "active", localPort: 6379 } },
						},
						{
							port: 8787,
							label: "Worker",
							hostType: "remote-device",
							forward: { status: { state: "active", localPort: 8787 } },
						},
						{
							port: 9658,
							label: "Realtime",
							hostType: "remote-device",
							forward: { status: { state: "active", localPort: 9658 } },
						},
						{
							port: 9655,
							label: "Gate",
							hostType: "remote-device",
							forward: { status: { state: "active", localPort: 9655 } },
						},
						{
							port: 9229,
							label: "Inspector",
							hostType: "remote-device",
							forward: { status: { state: "active", localPort: 9229 } },
						},
						{
							port: 8025,
							label: "Mailpit",
							hostType: "remote-device",
							forward: { status: { state: "active", localPort: 8025 } },
						},
					]}
					onOpenPort={fn()}
					onClosePort={fn()}
					onCloseAll={fn()}
				/>
			),
		},
	},
};

export const Everything: Story = {
	args: {
		workspace: {
			name: "Cloud presence",
			createdBy: { userId: "kiet", name: "Kiet Ho", image: null },
			status: "ready",
			agentStatus: "working",
			agentStatusAt: new Date("2026-09-25T11:58:00Z"),
			createdAt: new Date("2026-09-25T09:00:00Z"),
		},
		isMine: false,
		ports: {
			count: 1,
			card: (
				<DashboardSidebarPortsCard
					ports={[
						{
							port: 3000,
							label: "Frontend",
							hostType: "remote-device",
							forward: { status: { state: "active", localPort: 3000 } },
						},
					]}
					onOpenPort={fn()}
					onClosePort={fn()}
					onCloseAll={fn()}
				/>
			),
		},
		pullRequest: { number: 7866, state: "open", isDraft: true },
	},
};

export const LongName: Story = {
	args: {
		workspace: {
			name: "Migrate every sandbox from Blaxel to Vercel and keep the goldens",
			createdBy: { userId: "kiet", name: "Kiet Ho", image: null },
			status: "ready",
			agentStatus: null,
			agentStatusAt: new Date("2026-09-25T11:55:00Z"),
			createdAt: new Date("2026-09-25T09:00:00Z"),
		},
		isMine: false,
		pullRequest: { number: 7840, state: "merged", isDraft: false },
	},
};

export const Section: Story = {
	render: (args) => (
		<div className="space-y-0.5">
			<DashboardSidebarCloudRow
				{...args}
				workspace={{
					name: "Cloud presence",
					createdBy: {
						userId: "satya",
						name: "Satya Patel",
						image: "https://github.com/github.png",
					},
					status: "ready",
					agentStatus: "working",
					agentStatusAt: new Date("2026-09-25T11:58:00Z"),
					createdAt: new Date("2026-09-25T09:00:00Z"),
				}}
				isActive
			/>
			<DashboardSidebarCloudRow
				{...args}
				workspace={{
					name: "Superset PR #7851 review",
					createdBy: { userId: "kiet", name: "Kiet Ho", image: null },
					status: "ready",
					agentStatus: "review",
					agentStatusAt: new Date("2026-09-25T11:50:00Z"),
					createdAt: new Date("2026-09-24T09:00:00Z"),
				}}
				isMine={false}
				isRead={false}
				pullRequest={{ number: 7851, state: "open", isDraft: false }}
			/>
			<DashboardSidebarCloudRow
				{...args}
				workspace={{
					name: "Environment region picker",
					createdBy: {
						userId: "satya",
						name: "Satya Patel",
						image: "https://github.com/github.png",
					},
					status: "ready",
					agentStatus: "permission",
					agentStatusAt: new Date("2026-09-25T11:57:00Z"),
					createdAt: new Date("2026-09-25T07:00:00Z"),
				}}
				pullRequest={{ number: 7858, state: "open", isDraft: false }}
			/>
			<DashboardSidebarCloudRow
				{...args}
				workspace={{
					name: "Casual greeting",
					createdBy: { userId: "avi", name: "Avi Peltz", image: null },
					status: "ready",
					agentStatus: null,
					agentStatusAt: new Date("2026-09-13T12:00:00Z"),
					createdAt: new Date("2026-09-12T09:00:00Z"),
				}}
				isMine={false}
			/>
		</div>
	),
};
