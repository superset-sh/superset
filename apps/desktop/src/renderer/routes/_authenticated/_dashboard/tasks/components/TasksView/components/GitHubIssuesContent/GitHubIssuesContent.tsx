import {
	RepositoryIssuesContent,
	type RepositoryIssuesContentProps,
} from "../RepositoryIssuesContent";

export type SelectedIssue = import("../RepositoryIssuesContent").SelectedIssue;

export function GitHubIssuesContent(
	props: Omit<RepositoryIssuesContentProps, "provider">,
) {
	return <RepositoryIssuesContent {...props} provider="github" />;
}
