import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ProjectsList } from "./ProjectsList";

const satya = { userId: "satya", name: "Satya Patel", image: null };
const avi = { userId: "avi", name: "Avi Peltz", image: null };
const kiet = { userId: "kiet", name: "Kiet Ho", image: null };
const createdAt = new Date("2026-09-20T12:00:00Z");

const meta = {
	component: ProjectsList,
	parameters: { layout: "fullscreen" },
	decorators: [
		(Story) => (
			<div className="h-[640px] w-full max-w-[960px] overflow-auto bg-background">
				<Story />
			</div>
		),
	],
	args: {
		projects: [
			{
				id: "p1",
				icon: "gauge",
				name: "Sidebar performance",
				color: "#f97316",
				state: "started",
				targetDate: "2026-10-04",
				createdAt,
				lead: avi,
				workspaceCount: 4,
				taskCount: 12,
			},
			{
				id: "p2",
				icon: "cloud",
				name: "Cloud workspaces",
				color: "#3b82f6",
				state: "started",
				targetDate: "2026-10-18",
				createdAt,
				lead: satya,
				workspaceCount: 12,
				taskCount: 36,
			},
			{
				id: "p3",
				icon: "device-mobile",
				name: "Mobile composer and attachments rework for iOS 26",
				color: "#a855f7",
				state: "planned",
				targetDate: null,
				createdAt,
				lead: kiet,
				workspaceCount: 0,
				taskCount: 0,
			},
			{
				id: "p4",
				icon: "broom",
				name: "Groomer",
				color: "#22c55e",
				state: "planned",
				targetDate: "2026-11-01",
				createdAt,
				lead: null,
				workspaceCount: 1,
				taskCount: 3,
			},
			{
				id: "p5",
				icon: null,
				name: "Linear import",
				color: "#06b6d4",
				state: "paused",
				targetDate: null,
				createdAt,
				lead: avi,
				workspaceCount: 2,
				taskCount: 6,
			},
			{
				id: "p6",
				icon: "chats-circle",
				name: "Pages comments",
				color: "#ec4899",
				state: "completed",
				targetDate: "2026-09-15",
				createdAt,
				lead: satya,
				workspaceCount: 7,
				taskCount: 21,
			},
		],
		onOpen: fn(),
		people: [{ id: "satya", name: "Satya Patel", image: null }],
		onUpdate: fn(),
		isFiltered: false,
		sort: "status",
	},
} satisfies Meta<typeof ProjectsList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Several: Story = {};

export const OnlyInProgress: Story = {
	args: { projects: meta.args.projects.slice(0, 2) },
};

export const None: Story = { args: { projects: [] } };

export const NoneMatch: Story = {
	args: { projects: [], isFiltered: true },
};
