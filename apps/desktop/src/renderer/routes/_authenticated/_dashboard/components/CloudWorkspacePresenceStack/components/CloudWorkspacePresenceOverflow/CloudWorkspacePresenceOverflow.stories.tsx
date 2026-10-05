import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { CloudWorkspacePresenceOverflow } from "./CloudWorkspacePresenceOverflow";

const now = new Date("2026-09-25T12:00:00Z");

const meta = {
	component: CloudWorkspacePresenceOverflow,
	decorators: [
		(Story) => (
			<div className="flex w-[320px] justify-end bg-background p-6">
				<Story />
			</div>
		),
	],
	args: {
		label: "+2",
		now,
		isActive: (lastSeenAt: Date) =>
			now.getTime() - lastSeenAt.getTime() < 15 * 60 * 1000,
		onOpenPerson: fn(),
		people: [
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
		],
	},
} satisfies Meta<typeof CloudWorkspacePresenceOverflow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const ManyPeople: Story = {
	args: {
		label: "+12",
		people: Array.from({ length: 12 }, (_, index) => ({
			userId: `person-${index}`,
			name: `Teammate ${index + 1}`,
			image: null,
			lastSeenAt: new Date(now.getTime() - index * 60 * 60 * 1000),
		})),
	},
};
