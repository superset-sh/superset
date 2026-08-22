import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { action } from "storybook/actions";
import { PullRequestsButton } from "./PullRequestsButton";

/** Only what colouring reads; the button asks for no more than this. */
interface SyncedPullRequest {
	state: string;
	isDraft: boolean;
	mergedAt: Date | null;
}

function pr(overrides: Partial<SyncedPullRequest> = {}): SyncedPullRequest {
	return {
		state: "open",
		isDraft: false,
		mergedAt: null,
		...overrides,
	};
}

const open = pr();
const draft = pr({ isDraft: true });
const merged = pr({
	state: "merged",
	mergedAt: new Date("2026-08-15T22:25:00Z"),
});
const closed = pr({ state: "closed" });

const meta = {
	title: "workspace/PullRequestsButton",
	parameters: { fullBleed: true },
	render: ({ pullRequests }) => (
		<View className="px-4">
			<PullRequestsButton
				onPress={action("open pull requests")}
				pullRequests={pullRequests}
			/>
		</View>
	),
} satisfies Meta<{ pullRequests: SyncedPullRequest[] }>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Several, and the newest is a draft — so the glyph is grey. */
export const SeveralNewestIsDraft: Story = {
	args: { pullRequests: [merged, open, draft] },
};
/** The same three with an open one last, so the glyph goes green. */
export const ThreeLatestOpen: Story = {
	args: { pullRequests: [merged, draft, open] },
};
export const LatestMerged: Story = { args: { pullRequests: [open, merged] } };
export const LatestClosed: Story = { args: { pullRequests: [open, closed] } };
/** One, so the count drops out of the label. */
export const ExactlyOne: Story = { args: { pullRequests: [open] } };
export const NoneHidden: Story = { args: { pullRequests: [] } };
