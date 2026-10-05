import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ProjectListRow } from "./ProjectListRow";

const meta = {
	component: ProjectListRow,
	decorators: [
		(Story) => (
			<div className="w-full max-w-[760px] bg-background">
				<table className="w-full border-collapse">
					<tbody>
						<Story />
					</tbody>
				</table>
			</div>
		),
	],
	args: {
		project: {
			id: "p1",
			icon: "gauge",
			name: "Sidebar performance",
			color: "#f97316",
			state: "started",
			targetDate: "2026-10-04",
			createdAt: new Date("2026-09-20T12:00:00Z"),
			lead: { userId: "avi", name: "Avi Peltz", image: null },
			workspaceCount: 4,
			taskCount: 12,
		},
		onOpen: fn(),
		people: [{ id: "satya", name: "Satya Patel", image: null }],
		onUpdate: fn(),
	},
} satisfies Meta<typeof ProjectListRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithLeadAndTarget: Story = {};

export const NoLeadNoTarget: Story = {
	args: {
		project: {
			...meta.args.project,
			name: "Mobile composer and attachments rework for iOS 26 with a very long name",
			icon: null,
			targetDate: null,
			lead: null,
			workspaceCount: 0,
			taskCount: 0,
		},
	},
};
