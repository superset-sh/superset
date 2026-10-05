import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { fn } from "storybook/test";
import { DashboardSidebarCloudHoverCard } from "../DashboardSidebarCloudHoverCard";
import { DashboardSidebarCloudHoverOverlay } from "./DashboardSidebarCloudHoverOverlay";

const meta = {
	component: DashboardSidebarCloudHoverOverlay,
	decorators: [
		(Story) => (
			<div className="h-[420px] w-[720px] bg-background p-6">
				<Story />
			</div>
		),
	],
	args: {
		anchor: null,
		onPointerEnter: fn(),
		onPointerLeave: fn(),
		onClose: fn(),
		children: (
			<DashboardSidebarCloudHoverCard
				workspace={{
					name: "Cloud presence",
					createdAt: new Date("2026-09-25T10:00:00Z"),
					createdBy: {
						userId: "satya",
						name: "Satya Patel",
						image: "https://github.com/github.png",
					},
				}}
				repositories={["superset-sh/superset"]}
				tasks={[
					{
						id: "task-2463",
						slug: "SUPER-2463",
						externalProvider: null,
						externalKey: null,
						title: "Cloud workspace presence in the sidebar",
						status: { type: "started", color: "#f2c94c", progressPercent: 60 },
					},
				]}
				pullRequests={[]}
				now={new Date("2026-09-25T12:00:00Z")}
				onOpenDetails={fn()}
				onOpenPerson={fn()}
				onOpenTask={fn()}
				onOpenPullRequest={fn()}
				onOpenRepository={fn()}
			/>
		),
	},
	render: function Render(args) {
		const [anchor, setAnchor] = useState<HTMLDivElement | null>(null);
		return (
			<>
				<div
					ref={setAnchor}
					className="w-[260px] rounded-md bg-sidebar px-3 py-1.5 text-sm"
				>
					Cloud presence
				</div>
				<DashboardSidebarCloudHoverOverlay {...args} anchor={anchor} />
			</>
		);
	},
} satisfies Meta<typeof DashboardSidebarCloudHoverOverlay>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = {
	args: {
		children: (
			<DashboardSidebarCloudHoverCard
				workspace={{
					name: "Scratch box",
					createdAt: new Date("2026-09-25T11:50:00Z"),
					createdBy: { userId: "kiet", name: "Kiet Ho", image: null },
				}}
				repositories={[]}
				tasks={[]}
				pullRequests={[]}
				now={new Date("2026-09-25T12:00:00Z")}
				onOpenDetails={fn()}
				onOpenPerson={fn()}
				onOpenTask={fn()}
				onOpenPullRequest={fn()}
				onOpenRepository={fn()}
			/>
		),
	},
};
