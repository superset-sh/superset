import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { PullRequestLink } from "./PullRequestLink";

const meta = {
	component: PullRequestLink,
	decorators: [
		(Story) => (
			<div className="w-[640px] bg-background p-6">
				<Story />
			</div>
		),
	],
	render: (args) => (
		<p className="text-[14px] leading-relaxed text-foreground">
			<PullRequestLink {...args} /> is open, checks passing.
		</p>
	),
	args: {
		number: 7855,
		pullRequest: {
			title: "Sidebar: memoize hover measurement",
			state: "open",
			isDraft: false,
		},
		onOpen: fn(),
	},
} satisfies Meta<typeof PullRequestLink>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};

export const Draft: Story = {
	args: {
		pullRequest: {
			title: "Presence: show who is in a box",
			state: "open",
			isDraft: true,
		},
	},
};

export const Merged: Story = {
	args: {
		pullRequest: {
			title: "Cloud: archive deletes the golden",
			state: "merged",
			isDraft: false,
		},
	},
};

export const NotSynced: Story = {
	args: {
		pullRequest: null,
		fallbackTitle: "Sidebar: memoize hover measurement",
	},
};
