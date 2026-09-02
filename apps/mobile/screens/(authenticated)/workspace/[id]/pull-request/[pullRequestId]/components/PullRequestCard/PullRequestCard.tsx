import { useLingui } from "@lingui/react/macro";
import { Fragment, type ReactElement } from "react";
import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import {
	type PullRequest,
	type PullRequestCapabilities,
	type PullRequestCheck,
	type PullRequestMergeability,
	type PullRequestReviewer,
	tallyChecks,
} from "../../../../utils/pullRequest";
import {
	type ActionId,
	isMergeabilityPending,
	resolveActions,
	resolveCardRows,
	resolvePullRequestState,
} from "../../utils/pullRequestState";
import { ReviewerAvatar } from "../ReviewerAvatar";
import { ActionButton } from "./components/ActionButton";
import { CardRow } from "./components/CardRow";
import { ChecksSection } from "./components/ChecksSection";
import { ReviewersRow } from "./components/ReviewersRow";
import { actionLabelFor, headlineFor } from "./copy";
import { mergedSubLabel } from "./utils/mergedSubLabel";

/** What the pull request needs next and what you can do about it; props in, callbacks out. */
export function PullRequestCard({
	pullRequest,
	checks,
	reviewers,
	mergeability,
	capabilities,
	busyAction,
	onAction,
	onOpenChecks,
	onOpenCheck,
	onOpenReviewers,
}: {
	pullRequest: PullRequest;
	checks: PullRequestCheck[];
	reviewers: PullRequestReviewer[];
	mergeability: PullRequestMergeability;
	capabilities: PullRequestCapabilities;
	busyAction?: ActionId | null;
	onAction: (action: ActionId) => void;
	onOpenChecks?: () => void;
	onOpenCheck?: (check: PullRequestCheck) => void;
	onOpenReviewers?: () => void;
}) {
	const { t } = useLingui();
	const detail = { pullRequest, checks, reviewers, mergeability, capabilities };
	const state = resolvePullRequestState(detail);
	const actions = resolveActions(state, detail);
	const tally = tallyChecks(checks);
	const mergeMethod = mergeability.allowedMergeMethods[0] ?? "squash";

	const rows: ReactElement[] = resolveCardRows(state, detail).flatMap((row) => {
		if (row === "checks") {
			return (
				<ChecksSection
					key="checks"
					onOpenCheck={onOpenCheck}
					onOpenChecks={onOpenChecks}
					tally={tally}
				/>
			);
		}
		if (row === "reviewers") {
			return (
				<ReviewersRow
					key="reviewers"
					onPress={reviewers.length > 0 ? onOpenReviewers : undefined}
					reviewers={reviewers}
				/>
			);
		}
		const mergedBy = pullRequest.mergedBy;
		if (!mergedBy) return [];
		return (
			<CardRow
				key="merged-by"
				label={t({
					message: `Merged by ${mergedBy.login}`,
				})}
				leading={
					<ReviewerAvatar
						reviewer={{
							login: mergedBy.login,
							avatarUrl: mergedBy.avatarUrl,
							isTeam: false,
							state: "APPROVED",
						}}
					/>
				}
				subLabel={
					pullRequest.mergedAt ? mergedSubLabel(pullRequest.mergedAt) : null
				}
			/>
		);
	});

	return (
		<View className="bg-card border-border mx-4 overflow-hidden rounded-xl border">
			<View className="px-4 pt-4">
				<Text className="font-semibold text-[15px] tracking-[-0.1px]">
					{headlineFor(state, { isDraft: pullRequest.isDraft, tally })}
				</Text>
			</View>

			{rows.map((row, index) => (
				<Fragment key={row.key}>
					{index > 0 ? <View className="bg-border/60 mx-4 h-px" /> : null}
					<View className="px-4 py-3.5">{row}</View>
				</Fragment>
			))}

			{actions.length > 0 ? (
				<View
					className={cn("gap-2 px-4 pb-4", rows.length > 0 ? "pt-1" : "pt-6")}
				>
					{actions.map((action) => (
						<ActionButton
							action={action}
							busy={
								busyAction === action ||
								(action === "merge" && isMergeabilityPending(mergeability))
							}
							key={action}
							label={actionLabelFor(action, { mergeMethod })}
							onPress={() => onAction(action)}
						/>
					))}
				</View>
			) : (
				<View className="pb-2" />
			)}
		</View>
	);
}
