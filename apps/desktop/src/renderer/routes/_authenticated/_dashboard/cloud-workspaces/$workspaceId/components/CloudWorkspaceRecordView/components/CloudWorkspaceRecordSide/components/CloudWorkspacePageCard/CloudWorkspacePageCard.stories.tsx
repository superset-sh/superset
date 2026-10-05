import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { CloudWorkspacePageCard } from "./CloudWorkspacePageCard";

const now = new Date("2026-09-26T12:00:00Z");
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000);

const meta = {
	component: CloudWorkspacePageCard,
	decorators: [
		(Story) => (
			<div className="w-[220px] bg-background p-6">
				<Story />
			</div>
		),
	],
	args: {
		page: {
			id: "p1",
			title: "Sidebar lag: before/after trace",
			thumbnailUrl: "fixtures/thumb-trace.jpg",
			createdAt: ago(40),
			updatedAt: ago(40),
		},
		now,
		onOpen: fn(),
	},
} satisfies Meta<typeof CloudWorkspacePageCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithThumbnail: Story = {};

export const Edited: Story = {
	args: {
		page: {
			id: "p2",
			title: "Hover provider re-measure notes",
			thumbnailUrl: "fixtures/thumb-notes.jpg",
			createdAt: ago(180),
			updatedAt: ago(120),
		},
	},
};

export const NoThumbnail: Story = {
	args: {
		page: {
			id: "p3",
			title: "Repro steps",
			thumbnailUrl: null,
			createdAt: ago(240),
			updatedAt: ago(240),
		},
	},
};
