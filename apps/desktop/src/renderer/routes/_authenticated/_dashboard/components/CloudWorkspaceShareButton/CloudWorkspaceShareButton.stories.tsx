import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn, userEvent, within } from "storybook/test";
import { CloudWorkspaceShareButton } from "./CloudWorkspaceShareButton";

const meta = {
	component: CloudWorkspaceShareButton,
	decorators: [
		(Story) => (
			<div className="flex h-[320px] w-[420px] justify-end">
				<Story />
			</div>
		),
	],
	args: {
		workspaceId: "ws-1",
		owner: {
			userId: "satya",
			name: "Satya Patel",
			image: "https://github.com/github.png",
		},
		visibility: "org",
		canEdit: true,
		onSetVisibility: fn(async () => undefined),
	},
	play: async ({ canvasElement }) => {
		await userEvent.click(within(canvasElement).getByRole("button"));
	},
} satisfies Meta<typeof CloudWorkspaceShareButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OwnerOrgWide: Story = {};

export const OwnerPrivate: Story = {
	args: { visibility: "just_me" },
};

export const SomeoneElses: Story = {
	args: {
		owner: { userId: "kiet", name: "Kiet Ho", image: null },
		canEdit: false,
	},
};
