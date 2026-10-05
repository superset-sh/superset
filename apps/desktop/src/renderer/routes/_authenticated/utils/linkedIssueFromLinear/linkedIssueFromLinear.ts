import type { LinkedIssue } from "renderer/stores/new-workspace-draft";

export interface LinearIssueReference {
	identifier: string;
	title: string;
	url: string;
	branchName: string;
}

export function linkedIssueFromLinear(
	issue: LinearIssueReference,
): LinkedIssue {
	return {
		slug: issue.identifier,
		title: issue.title,
		source: "linear",
		url: issue.url,
		branch: issue.branchName || undefined,
	};
}
