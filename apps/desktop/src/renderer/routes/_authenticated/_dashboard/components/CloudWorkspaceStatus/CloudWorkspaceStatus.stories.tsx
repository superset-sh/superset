import type { Meta, StoryObj } from "@storybook/react-vite";
import { CloudWorkspaceStatus } from "./CloudWorkspaceStatus";

const meta = {
	component: CloudWorkspaceStatus,
	decorators: [
		(Story) => (
			<div className="flex h-4 w-6 items-center justify-end">
				<Story />
			</div>
		),
	],
	args: {
		workspace: {
			status: "ready",
			agentStatus: "working",
			agentStatusAt: new Date("2026-09-25T11:58:00Z"),
		},
		isRead: true,
		now: new Date("2026-09-25T12:00:00Z"),
	},
} satisfies Meta<typeof CloudWorkspaceStatus>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Creating: Story = {
	args: {
		workspace: {
			status: "provisioning",
			agentStatus: null,
			agentStatusAt: null,
		},
	},
};

export const SandboxFailed: Story = {
	args: {
		workspace: {
			status: "failed",
			agentStatus: null,
			agentStatusAt: null,
		},
	},
};

export const NeedsYou: Story = {
	args: {
		workspace: {
			status: "ready",
			agentStatus: "permission",
			agentStatusAt: new Date("2026-09-25T11:57:00Z"),
		},
	},
};

export const AgentFailed: Story = {
	args: {
		workspace: {
			status: "ready",
			agentStatus: "failed",
			agentStatusAt: new Date("2026-09-25T11:40:00Z"),
		},
	},
};

export const Working: Story = {};

export const DoneUnread: Story = {
	args: {
		workspace: {
			status: "ready",
			agentStatus: "review",
			agentStatusAt: new Date("2026-09-25T11:50:00Z"),
		},
		isRead: false,
	},
};

export const DoneRead: Story = {
	args: {
		workspace: {
			status: "ready",
			agentStatus: "review",
			agentStatusAt: new Date("2026-09-25T11:50:00Z"),
		},
	},
};

export const IdleNow: Story = {
	args: {
		workspace: {
			status: "ready",
			agentStatus: null,
			agentStatusAt: new Date("2026-09-25T11:59:40Z"),
		},
	},
};

export const IdleFiftyNineMinutes: Story = {
	args: {
		workspace: {
			status: "ready",
			agentStatus: null,
			agentStatusAt: new Date("2026-09-25T11:01:00Z"),
		},
	},
};

export const IdleFiftyTwoWeeks: Story = {
	args: {
		workspace: {
			status: "ready",
			agentStatus: null,
			agentStatusAt: new Date("2025-09-26T12:00:00Z"),
		},
	},
};

export const NeverNotified: Story = {
	args: {
		workspace: {
			status: "ready",
			agentStatus: null,
			agentStatusAt: null,
		},
	},
};
