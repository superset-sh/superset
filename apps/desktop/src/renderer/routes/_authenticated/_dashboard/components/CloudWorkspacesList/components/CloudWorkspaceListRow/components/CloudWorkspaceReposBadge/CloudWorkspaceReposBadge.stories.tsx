import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { CloudWorkspaceReposBadge } from "./CloudWorkspaceReposBadge";

const meta = {
	component: CloudWorkspaceReposBadge,
	decorators: [
		(Story) => (
			<div className="w-[320px] bg-background p-6">
				<Story />
			</div>
		),
	],
	args: {
		repos: ["superset-sh/superset"],
		onOpenRepo: fn(),
	},
} satisfies Meta<typeof CloudWorkspaceReposBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const One: Story = {};

export const Several: Story = {
	args: {
		repos: [
			"superset-sh/superset",
			"superset-sh/docs",
			"superset-sh/marketing-site",
		],
	},
};

export const NoOwner: Story = {
	args: { repos: ["superset"] },
};

export const Empty: Story = {
	args: { repos: [] },
};
