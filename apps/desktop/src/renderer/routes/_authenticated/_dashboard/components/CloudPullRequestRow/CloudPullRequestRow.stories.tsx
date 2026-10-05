import type { Meta, StoryObj } from "@storybook/react-vite";
import type { CloudPullRequest } from "renderer/routes/_authenticated/_dashboard/hooks/useCloudPullRequests";
import { fn } from "storybook/test";
import { CloudPullRequestRow } from "./CloudPullRequestRow";

const pullRequest: CloudPullRequest = {
	url: "https://github.com/superset-sh/superset/pull/7866",
	number: 7866,
	title: "Cloud workspace presence in the sidebar",
	state: "open",
	isDraft: false,
	additions: 412,
	deletions: 57,
};

const meta = {
	component: CloudPullRequestRow,
	decorators: [
		(Story) => (
			<div className="w-80 bg-background p-6">
				<Story />
			</div>
		),
	],
	args: {
		pullRequest,
		onOpen: fn(),
	},
} satisfies Meta<typeof CloudPullRequestRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};

export const Draft: Story = {
	args: { pullRequest: { ...pullRequest, isDraft: true } },
};

export const Merged: Story = {
	args: { pullRequest: { ...pullRequest, state: "merged" } },
};

export const Closed: Story = {
	args: { pullRequest: { ...pullRequest, state: "closed" } },
};

export const LongTitle: Story = {
	args: {
		pullRequest: {
			...pullRequest,
			title:
				"Migrate every sandbox from Blaxel to Vercel and keep the goldens warm across regions",
			additions: 12408,
			deletions: 9311,
		},
	},
};

export const NoChanges: Story = {
	args: { pullRequest: { ...pullRequest, additions: 0, deletions: 0 } },
};
