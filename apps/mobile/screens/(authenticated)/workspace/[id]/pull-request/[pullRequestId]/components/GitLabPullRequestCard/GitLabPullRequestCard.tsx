import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import type { GitlabPullRequestDetail } from "../../hooks/gitlabActionTarget";
import type { GitlabDetailView } from "../../utils/gitlabDetailView/gitlabDetailView";
import {
	type GitLabState,
	resolveGitLabActions,
	resolveGitLabState,
} from "../../utils/pullRequestState/gitlabState";
import type { ActionId } from "../../utils/pullRequestState/pullRequestState";
import { ActionButton } from "../PullRequestCard/components/ActionButton";

const HEADLINES: Record<GitLabState, MessageDescriptor> = {
	merged: msg({ message: "Merged" }),
	closed: msg({ message: "Closed", context: "status" }),
	conflicts: msg({ message: "Merge conflicts" }),
	"checks-failed": msg({ message: "Checks failed" }),
	"check-needs-action": msg({ message: "Checks need action" }),
	"waiting-for-checks": msg({ message: "Waiting for Checks" }),
	"waiting-for-review": msg({ message: "Waiting for Review" }),
	"unresolved-conversations": msg({ message: "Unresolved conversations" }),
	blocked: msg({ message: "Merge blocked" }),
	ready: msg({ message: "Ready to Merge" }),
	checking: msg({ message: "Checking merge requirements" }),
	locked: msg({ message: "Merge request is locked" }),
	"approval-unknown": msg({ message: "Approval requirements unavailable" }),
};
const LABELS: Record<Exclude<ActionId, "dequeue">, MessageDescriptor> = {
	merge: msg({ message: "Merge" }),
	"mark-ready": msg({ message: "Mark Ready" }),
	"update-branch": msg({ message: "Rebase branch" }),
	reopen: msg({ message: "Reopen" }),
	"ask-resolve-conflicts": msg({ message: "Resolve conflicts with Agent" }),
	"ask-fix-checks": msg({ message: "Fix Checks with Agent" }),
	"ask-address-comments": msg({ message: "Address Comments with Agent" }),
};
export function GitLabPullRequestCard({
	detail,
	view,
	busyAction,
	onAction,
	onOpenChecks,
	onOpenCheck,
	onOpenReviewers,
}: {
	detail: GitlabPullRequestDetail;
	view: GitlabDetailView;
	busyAction: ActionId | null;
	onAction: (action: ActionId) => void;
	onOpenChecks: () => void;
	onOpenCheck: (check: GitlabDetailView["checks"][number]) => void;
	onOpenReviewers: () => void;
}) {
	const { i18n, t } = useLingui();
	const { formatNumber } = useFormat();
	const state = resolveGitLabState(detail);
	const actions = resolveGitLabActions(detail).filter(
		(action): action is Exclude<ActionId, "dequeue"> => action !== "dequeue",
	);
	const mergeStatus = i18n._(HEADLINES[state]);
	const approvedBy = detail.reviewState.approvedBy.join(", ");
	const required =
		detail.reviewState.approvalsRequired === null
			? null
			: formatNumber(detail.reviewState.approvalsRequired);
	const left =
		detail.reviewState.approvalsLeft === null
			? null
			: formatNumber(detail.reviewState.approvalsLeft);
	return (
		<View className="bg-card border-border mx-4 gap-3 rounded-xl border p-4">
			<Text className="font-semibold text-[15px]">
				{detail.pullRequest.isDraft && detail.pullRequest.state === "open"
					? t({ message: "Draft" })
					: i18n._(HEADLINES[state])}
			</Text>
			<Text className="text-muted-foreground text-[13px]">
				{t({ message: `GitLab merge status: ${mergeStatus}` })}
			</Text>
			{required !== null && left !== null ? (
				<Text className="text-muted-foreground text-[13px]">
					{t({ message: `Approvals remaining: ${left} of ${required}` })}
				</Text>
			) : (
				<Text className="text-muted-foreground text-[13px]">
					{t({ message: "Approval requirements unavailable" })}
				</Text>
			)}
			{approvedBy ? (
				<Text className="text-muted-foreground text-[13px]">
					{t({ message: `Approved by ${approvedBy}` })}
				</Text>
			) : null}
			{view.checks.length > 0 ? (
				<Pressable accessibilityRole="button" onPress={onOpenChecks}>
					<Text>
						<Trans>View checks</Trans>
					</Text>
				</Pressable>
			) : null}
			{view.checks
				.filter(
					(check) =>
						check.status === "COMPLETED" && check.conclusion === "FAILURE",
				)
				.slice(0, 3)
				.map((check) => (
					<Pressable
						key={check.name}
						accessibilityRole="button"
						onPress={() => onOpenCheck(check)}
					>
						<Text>{check.name}</Text>
					</Pressable>
				))}
			{view.reviewers.length > 0 ? (
				<Pressable accessibilityRole="button" onPress={onOpenReviewers}>
					<Text>
						<Trans>Reviewers</Trans>
					</Text>
				</Pressable>
			) : null}
			{actions.map((action) => (
				<ActionButton
					key={action}
					action={action}
					busy={busyAction === action}
					disabled={busyAction !== null}
					label={i18n._(LABELS[action])}
					onPress={() => onAction(action)}
				/>
			))}
		</View>
	);
}
