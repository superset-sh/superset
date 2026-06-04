import { useCallback } from "react";
import type {
	DashboardNewWorkspaceDraft,
	LinkedIssue,
	LinkedPR,
} from "../../../../../DashboardNewWorkspaceDraftContext";

/**
 * Bundle of handlers that mutate `linkedIssues` / `linkedPR` on the draft.
 * Pure delegation — no state of its own. Co-located with PromptGroup
 * because that's the only consumer.
 *
 * `linkedIssues` is needed to dedupe adds and to filter on remove;
 * setLinkedPR / removeLinkedPR don't need to read the current PR, so the
 * hook doesn't ask for it.
 */
export function useLinkedContext(
	linkedIssues: LinkedIssue[],
	updateDraft: (patch: Partial<DashboardNewWorkspaceDraft>) => void,
) {
	const addLinkedIssue = useCallback(
		(slug: string, title: string, taskId: string | undefined, url?: string) => {
			if (linkedIssues.some((issue) => issue.slug === slug)) return;
			updateDraft({
				linkedIssues: [
					...linkedIssues,
					{ slug, title, source: "internal", taskId, url },
				],
			});
		},
		[linkedIssues, updateDraft],
	);

	const addLinkedGitHubIssue = useCallback(
		(issueNumber: number, title: string, url: string, state: string) => {
			if (linkedIssues.some((i) => i.url === url)) return;
			updateDraft({
				linkedIssues: [
					...linkedIssues,
					{
						slug: `#${issueNumber}`,
						title,
						source: "github",
						url,
						number: issueNumber,
						state: state.toLowerCase() === "closed" ? "closed" : "open",
					},
				],
			});
		},
		[linkedIssues, updateDraft],
	);

	const removeLinkedIssue = useCallback(
		(slug: string) => {
			updateDraft({
				linkedIssues: linkedIssues.filter((i) => i.slug !== slug),
			});
		},
		[linkedIssues, updateDraft],
	);

	const setLinkedPR = useCallback(
		(pr: LinkedPR) => updateDraft({ linkedPR: pr }),
		[updateDraft],
	);

	const removeLinkedPR = useCallback(
		() => updateDraft({ linkedPR: null }),
		[updateDraft],
	);

	return {
		addLinkedIssue,
		addLinkedGitHubIssue,
		removeLinkedIssue,
		setLinkedPR,
		removeLinkedPR,
	};
}
