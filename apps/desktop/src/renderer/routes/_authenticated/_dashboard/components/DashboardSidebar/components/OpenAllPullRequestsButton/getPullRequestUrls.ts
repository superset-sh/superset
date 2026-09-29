import type { DashboardSidebarWorkspacePullRequest } from "../../types";

type WorkspacePullRequest = {
	pullRequest: Pick<
		DashboardSidebarWorkspacePullRequest,
		"url" | "state"
	> | null;
};

export function getPullRequestUrls(
	workspaces: WorkspacePullRequest[],
): string[] {
	return [
		...new Set(
			workspaces.flatMap(({ pullRequest }) => {
				if (
					!pullRequest ||
					pullRequest.state === "merged" ||
					pullRequest.state === "closed"
				)
					return [];
				return [pullRequest.url];
			}),
		),
	];
}
