import type { DashboardNewWorkspaceDraft } from "../../../../../DashboardNewWorkspaceDraftContext";

interface MappedLinkedContext {
	internalIssueIds: string[] | undefined;
	githubIssueUrls: string[] | undefined;
	linkedPrUrl: string | undefined;
}

/**
 * Maps draft linked issues/PR into the API payload shape.
 * Pure function — no side effects, no hooks.
 */
export function mapLinkedContext(
	draft: DashboardNewWorkspaceDraft,
): MappedLinkedContext {
	const internalIssueIds = draft.linkedIssues
		.filter((i) => i.source === "internal" && i.taskId)
		.map((i) => i.taskId as string);

	const githubIssueUrls = draft.linkedIssues
		.filter((i) => i.source === "github" && i.url)
		.map((i) => i.url as string);

	return {
		internalIssueIds:
			internalIssueIds.length > 0 ? internalIssueIds : undefined,
		githubIssueUrls: githubIssueUrls.length > 0 ? githubIssueUrls : undefined,
		linkedPrUrl: draft.linkedPR?.url,
	};
}
