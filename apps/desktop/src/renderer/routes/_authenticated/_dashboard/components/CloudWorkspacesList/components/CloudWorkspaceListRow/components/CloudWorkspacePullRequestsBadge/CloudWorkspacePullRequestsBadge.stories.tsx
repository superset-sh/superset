import type { Meta, StoryObj } from "@storybook/react-vite";
import type { CloudPullRequest } from "renderer/routes/_authenticated/_dashboard/hooks/useCloudPullRequests";
import { fn } from "storybook/test";
import { CloudWorkspacePullRequestsBadge } from "./CloudWorkspacePullRequestsBadge";

const openPullRequest: CloudPullRequest = {
	url: "https://github.com/superset-sh/superset/pull/7866",
	number: 7866,
	title: "Cloud workspace presence in the sidebar",
	state: "open",
	isDraft: false,
	additions: 412,
	deletions: 57,
};

const meta = {
	component: CloudWorkspacePullRequestsBadge,
	decorators: [
		(Story) => (
			<div className="w-[320px] bg-background p-6">
				<Story />
			</div>
		),
	],
	args: {
		pullRequests: [openPullRequest],
		onOpenPullRequest: fn(),
	},
} satisfies Meta<typeof CloudWorkspacePullRequestsBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};

export const Draft: Story = {
	args: {
		pullRequests: [{ ...openPullRequest, isDraft: true }],
	},
};

export const Merged: Story = {
	args: {
		pullRequests: [{ ...openPullRequest, state: "merged" }],
	},
};

export const Closed: Story = {
	args: {
		pullRequests: [{ ...openPullRequest, state: "closed" }],
	},
};

export const Several: Story = {
	args: {
		pullRequests: [
			openPullRequest,
			{
				url: "https://github.com/superset-sh/superset/pull/7869",
				number: 7869,
				title: "AvatarStack atom with Notion-style stacking",
				state: "merged",
				isDraft: false,
				additions: 96,
				deletions: 12,
			},
			{
				url: "https://github.com/superset-sh/superset/pull/7871",
				number: 7871,
				title: "Share a cloud workspace with the organization",
				state: "open",
				isDraft: true,
				additions: 40,
				deletions: 3,
			},
		],
	},
};

export const Empty: Story = {
	args: { pullRequests: [] },
};
