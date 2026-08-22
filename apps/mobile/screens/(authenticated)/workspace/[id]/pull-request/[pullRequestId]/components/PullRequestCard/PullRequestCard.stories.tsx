import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { action } from "storybook/actions";
import { Text } from "@/components/ui/text";
import { SCENARIOS, type ScenarioName } from "../fixtures";
import { PullRequestCard } from "./PullRequestCard";

/**
 * One story per reference screen — the card alone. The header is its own
 * component with its own stories, so what you see here is only what the card
 * draws.
 */
function Scenario({ name, busy }: { name: ScenarioName; busy?: boolean }) {
	const scenario = SCENARIOS[name];
	return (
		<PullRequestCard
			busyAction={busy ? "merge" : null}
			capabilities={scenario.capabilities}
			checks={scenario.checks}
			mergeability={scenario.mergeability}
			onAction={action("action")}
			onOpenCheck={action("open check")}
			onOpenChecks={action("open checks sheet")}
			onOpenReviewers={action("open reviewers sheet")}
			pullRequest={scenario.pullRequest}
			reviewers={scenario.reviewers}
		/>
	);
}

const meta = {
	title: "pull-request/Card",
	parameters: { fullBleed: true },
	argTypes: { name: { control: "select", options: Object.keys(SCENARIOS) } },
	render: ({ name, busy }) => <Scenario busy={busy} name={name} />,
} satisfies Meta<{ name: ScenarioName; busy?: boolean }>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Every scenario in one scroll, labelled with what it is. */
export const AllStates: Story = {
	args: { name: "draftConflicts" },
	render: () => (
		<View className="w-full gap-8">
			{(Object.keys(SCENARIOS) as ScenarioName[]).map((name) => (
				<View className="gap-3" key={name}>
					<Text className="text-muted-foreground px-4 font-semibold text-[11px] uppercase tracking-wider">
						{SCENARIOS[name].description}
					</Text>
					<Scenario name={name} />
				</View>
			))}
		</View>
	),
};

export const DraftWithConflicts: Story = { args: { name: "draftConflicts" } };
export const DraftAwaitingReviewers: Story = {
	args: { name: "draftReadyForReview" },
};
export const DraftWithChangesRequested: Story = {
	args: { name: "draftChangesRequested" },
};
export const DraftWithChecksRunning: Story = {
	args: { name: "draftChecksRunning" },
};
export const DraftCheckFailedWhileOthersRun: Story = {
	args: { name: "draftOneCheckFailedRestRunning" },
};
export const ConflictsWithBotComment: Story = {
	args: { name: "openConflictsBotCommented" },
};
export const ConflictsWithNothingElse: Story = {
	args: { name: "openConflictsBare" },
};
export const ApprovedWhileChecksRun: Story = {
	args: { name: "openApprovedChecksRunning" },
};
export const OneCheckFailed: Story = {
	args: { name: "openOneCheckFailed" },
};
export const OneOfTwoChecksFailed: Story = {
	args: { name: "openTwoChecksOneFailed" },
};
export const TwoChecksFailed: Story = {
	args: { name: "openTwoChecksFailed" },
};
export const WaitingForReview: Story = {
	args: { name: "openWaitingForReview" },
};
export const ReadyWithoutChecks: Story = { args: { name: "openReadyNoCi" } };
export const Merging: Story = { args: { name: "merging", busy: true } };
export const Merged: Story = { args: { name: "merged" } };
export const Closed: Story = { args: { name: "closed" } };
export const QueuedToMerge: Story = { args: { name: "queued" } };
export const BlockedByBranchRules: Story = { args: { name: "blocked" } };
export const MergeabilityStillComputing: Story = {
	args: { name: "mergeabilityPending" },
};
export const MoreReviewersThanFit: Story = { args: { name: "manyReviewers" } };
