import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { CloudWorkspaceRecordHeader } from "./CloudWorkspaceRecordHeader";

const now = new Date("2026-09-26T12:00:00Z");

const meta = {
	component: CloudWorkspaceRecordHeader,
	decorators: [
		(Story) => (
			<div className="w-[760px] bg-background p-6">
				<Story />
			</div>
		),
	],
	args: {
		workspace: {
			name: "lag-repro-01",
			createdAt: new Date(now.getTime() - 2 * 60_000),
			deletedAt: null,
			createdBy: { userId: "avi", name: "Avi Peltz", image: null },
			repositories: [
				{ fullName: "superset-sh/superset", branch: "superset/lag-repro-01" },
			],
		},
		now,
		onOpenPerson: fn(),
		onRename: fn(),
	},
} satisfies Meta<typeof CloudWorkspaceRecordHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithCreator: Story = {};

export const NoCreator: Story = {
	args: {
		workspace: { ...meta.args.workspace, createdBy: null },
	},
};

export const LongNameNoRepository: Story = {
	args: {
		workspace: {
			...meta.args.workspace,
			name: "investigate-flaky-host-service-reconnects-after-sleep",
			createdAt: new Date(now.getTime() - 3 * 24 * 60 * 60_000),
			repositories: [],
		},
	},
};

export const Archived: Story = {
	args: {
		workspace: {
			...meta.args.workspace,
			deletedAt: new Date(now.getTime() - 60_000),
		},
	},
};
