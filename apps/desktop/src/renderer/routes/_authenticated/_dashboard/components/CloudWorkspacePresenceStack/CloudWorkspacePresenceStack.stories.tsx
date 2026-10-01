import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn, userEvent, within } from "storybook/test";
import { CloudWorkspacePresenceStack } from "./CloudWorkspacePresenceStack";

const meta = {
	component: CloudWorkspacePresenceStack,
	decorators: [
		(Story) => (
			<div className="flex h-[160px] w-[420px] justify-end">
				<Story />
			</div>
		),
	],
	args: {
		now: new Date("2026-09-25T12:00:00Z"),
		activeWithinMs: 15 * 60 * 1000,
		viewerId: "satya",
		onOpenPerson: fn(),
		people: [
			{
				userId: "satya",
				name: "Satya Patel",
				image: "https://github.com/github.png",
				lastSeenAt: new Date("2026-09-25T11:59:00Z"),
			},
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
} satisfies Meta<typeof CloudWorkspacePresenceStack>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const HoveringActive: Story = {
	play: async ({ canvasElement }) => {
		await userEvent.hover(
			within(canvasElement).getByRole("button", { name: "Satya Patel" }),
		);
	},
};

export const HoveringLastSeen: Story = {
	play: async ({ canvasElement }) => {
		await userEvent.hover(
			within(canvasElement).getByRole("button", { name: "Avi Peltz" }),
		);
	},
};
