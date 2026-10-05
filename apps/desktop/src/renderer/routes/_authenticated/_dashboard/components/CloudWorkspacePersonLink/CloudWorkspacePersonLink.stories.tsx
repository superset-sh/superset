import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { CloudWorkspacePersonLink } from "./CloudWorkspacePersonLink";

const meta = {
	component: CloudWorkspacePersonLink,
	decorators: [
		(Story) => (
			<div className="w-[360px] text-[13px] bg-background p-6">
				<Story />
			</div>
		),
	],
	args: {
		person: { userId: "avi", name: "Avi Peltz", image: null },
		onOpen: fn(),
	},
} satisfies Meta<typeof CloudWorkspacePersonLink>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithAvatar: Story = {};

export const NameOnly: Story = { args: { showAvatar: false } };

export const LongName: Story = {
	args: {
		person: { userId: "harshith", name: "Harshith Mullapudi", image: null },
	},
};
