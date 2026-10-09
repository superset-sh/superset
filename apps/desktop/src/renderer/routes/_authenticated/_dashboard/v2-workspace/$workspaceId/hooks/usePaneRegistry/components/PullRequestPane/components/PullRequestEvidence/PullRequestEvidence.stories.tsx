import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { PullRequestEvidence } from "./PullRequestEvidence";

const meta = {
	component: PullRequestEvidence,
	decorators: [
		(Story) => (
			<div className="w-full max-w-[434px]">
				<Story />
			</div>
		),
	],
	args: {
		pages: ["Test Results", "Screenshots", "CDP Video"].map((title, index) => ({
			id: `page-${index}`,
			slug: `page-${index}`,
			title,
			thumbnailUrl:
				index % 2 === 0
					? "/fixtures/thumb-notes.jpg"
					: "/fixtures/thumb-trace.jpg",
		})),
		totalCount: 5,
		hasMore: true,
		isPending: false,
		isError: false,
		onRetry: fn(),
		onOpenPage: fn(),
		onViewAll: fn(),
	},
} satisfies Meta<typeof PullRequestEvidence>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithPages: Story = {};
export const NarrowRail: Story = {
	decorators: [
		(Story) => (
			<div className="w-[352px]">
				<Story />
			</div>
		),
	],
};
export const Loading: Story = {
	args: { pages: [], totalCount: undefined, isPending: true },
};
export const Empty: Story = {
	args: { pages: [], totalCount: 0, hasMore: false },
};
export const Failed: Story = {
	args: { pages: [], totalCount: undefined, hasMore: false, isError: true },
};
