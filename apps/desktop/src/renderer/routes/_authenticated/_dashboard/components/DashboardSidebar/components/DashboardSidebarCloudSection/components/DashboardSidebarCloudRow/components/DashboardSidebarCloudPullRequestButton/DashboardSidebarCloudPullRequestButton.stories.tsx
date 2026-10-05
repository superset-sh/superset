import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { DashboardSidebarCloudPullRequestButton } from "./DashboardSidebarCloudPullRequestButton";

const meta = {
	component: DashboardSidebarCloudPullRequestButton,
	decorators: [
		(Story) => (
			<div className="w-[120px] bg-sidebar p-6">
				<Story />
			</div>
		),
	],
	args: {
		pullRequest: { number: 7866, state: "open", isDraft: false },
		onClick: fn(),
	},
} satisfies Meta<typeof DashboardSidebarCloudPullRequestButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};

export const Draft: Story = {
	args: { pullRequest: { number: 7866, state: "open", isDraft: true } },
};

export const Merged: Story = {
	args: { pullRequest: { number: 7840, state: "merged", isDraft: false } },
};

export const Closed: Story = {
	args: { pullRequest: { number: 7839, state: "closed", isDraft: false } },
};
