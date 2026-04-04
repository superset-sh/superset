import type {
	LinkedIssue,
	LinkedPR,
	NewWorkspaceModalDraft,
} from "../../../../NewWorkspaceModalDraftContext";

export function useLinkedItems(
	linkedIssues: LinkedIssue[],
	updateDraft: (patch: Partial<NewWorkspaceModalDraft>) => void,
) {
	const addLinkedIssue = (
		slug: string,
		title: string,
		taskId: string | undefined,
		url?: string,
	) => {
		if (linkedIssues.some((issue) => issue.slug === slug)) return;
		updateDraft({
			linkedIssues: [
				...linkedIssues,
				{ slug, title, source: "internal", taskId, url },
			],
		});
	};

	const addLinkedGitHubIssue = (
		issueNumber: number,
		title: string,
		url: string,
		state: string,
	) => {
		const normalizedState: "open" | "closed" =
			state.toLowerCase() === "closed" ? "closed" : "open";

		const issue = {
			slug: `#${issueNumber}`,
			title,
			source: "github" as const,
			url,
			number: issueNumber,
			state: normalizedState,
		};
		if (linkedIssues.some((i) => i.url === url)) return;
		updateDraft({ linkedIssues: [...linkedIssues, issue] });
	};

	const removeLinkedIssue = (slug: string) => {
		updateDraft({
			linkedIssues: linkedIssues.filter((issue) => issue.slug !== slug),
		});
	};

	const setLinkedPR = (pr: LinkedPR) => {
		updateDraft({ linkedPR: pr });
	};

	const removeLinkedPR = () => {
		updateDraft({ linkedPR: null });
	};

	return {
		addLinkedIssue,
		addLinkedGitHubIssue,
		removeLinkedIssue,
		setLinkedPR,
		removeLinkedPR,
	};
}
