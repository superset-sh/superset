import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import type { ChecksTally, MergeMethod } from "../../../../utils/pullRequest";
import type { ActionId, PullRequestState } from "../../utils/pullRequestState";

/**
 * The headline names what the pull request is waiting on. Wording follows the
 * designs: a "Waiting for X" family, counts where a count is the point, and
 * "Ready for Review" rather than "Ready to Merge" while it's still a draft.
 */
export function headlineFor(
	state: PullRequestState,
	{ isDraft, tally }: { isDraft: boolean; tally: ChecksTally },
): string {
	switch (state) {
		case "merged":
			return i18n._(
				msg({
					message: "PR Merged and Closed",
				}),
			);
		case "closed":
			return i18n._(
				msg({
					message: "PR Closed",
				}),
			);
		case "queued":
			return i18n._(
				msg({
					message: "Queued to Merge",
				}),
			);
		case "conflicts":
			return i18n._(
				msg({
					message: "Resolve Conflicts to Merge",
				}),
			);
		case "checks-failed":
			return i18n._({
				...msg({
					message:
						"{count, plural, one {# Check Failed} other {# Checks Failed}}",
				}),
				values: { count: tally.failed },
			});
		case "check-needs-action":
			return i18n._({
				...msg({
					message:
						"{count, plural, one {# Check Needs Action} other {# Checks Need Action}}",
				}),
				values: { count: tally.needsAction },
			});
		case "waiting-for-checks":
			return i18n._(
				msg({
					message: "Waiting for Checks",
				}),
			);
		case "changes-requested":
			return i18n._(
				msg({
					message: "Changes Requested",
				}),
			);
		case "waiting-for-review":
			return i18n._(
				msg({
					message: "Waiting for Review",
				}),
			);
		case "unresolved-conversations":
			return i18n._(
				msg({
					message: "Resolve Conversations to Merge",
				}),
			);
		case "blocked":
			return i18n._(
				msg({
					message: "Blocked by Branch Rules",
				}),
			);
		case "ready":
			return isDraft
				? i18n._(
						msg({
							message: "Ready for Review",
						}),
					)
				: i18n._(
						msg({
							message: "Ready to Merge",
						}),
					);
	}
}

function mergeLabel(method: MergeMethod): string {
	switch (method) {
		case "squash":
			return i18n._(
				msg({
					message: "Squash & Merge",
				}),
			);
		case "merge":
			return i18n._(
				msg({
					message: "Create Merge Commit",
				}),
			);
		case "rebase":
			return i18n._(
				msg({
					message: "Rebase & Merge",
				}),
			);
	}
}

/**
 * Labels follow the designs verbatim. Conflicts deliberately reuse the checks
 * agent label — even on a card with no checks — so don't rename that button
 * to name the blocker.
 */
export function actionLabelFor(
	action: ActionId,
	{ mergeMethod }: { mergeMethod: MergeMethod },
): string {
	switch (action) {
		case "merge":
			return mergeLabel(mergeMethod);
		case "mark-ready":
			return i18n._(
				msg({
					message: "Mark Ready",
				}),
			);
		case "update-branch":
			return i18n._(
				msg({
					message: "Update Branch",
				}),
			);
		case "reopen":
			return i18n._(
				msg({
					message: "Reopen PR",
				}),
			);
		case "dequeue":
			return i18n._(
				msg({
					message: "Remove from Queue",
				}),
			);
		case "ask-resolve-conflicts":
		case "ask-fix-checks":
			return i18n._(
				msg({
					message: "Fix Checks with Agent",
				}),
			);
		case "ask-address-comments":
			return i18n._(
				msg({
					message: "Address Comments with Agent",
				}),
			);
	}
}
