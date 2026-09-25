import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import type { PullRequestRef } from "renderer/lib/github/pullRequestRef";
import { usePullRequestDetail } from "renderer/routes/_authenticated/_dashboard/pull-requests/hooks/usePullRequestDetail";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/workspace/providers/WorkspaceProvider";

/**
 * A pull request's content by its own identity, from whichever source can
 * answer: the workspace's host when its project is the PR's repository (the
 * person's own `gh`, no GitHub App required), else the API with the
 * organization's App installation, which is what a closed cloud box or a PR
 * in a repository nobody has checked out needs.
 */
export function usePullRequestPaneDetail(ref: PullRequestRef) {
	const { workspace, hostUrl } = useWorkspace();
	const organizationId = useActiveOrganizationId();
	const { projects, isReady: projectsReady } = useHostProjects();
	const project = projects.find(
		(candidate) => candidate.id === workspace.projectId,
	);
	const hostHasRepo =
		!!project?.repoOwner &&
		!!project.repoName &&
		`${project.repoOwner}/${project.repoName}`.toLowerCase() ===
			ref.repoFullName.toLowerCase();

	const fromHost = usePullRequestDetail({
		projectId: hostHasRepo ? (workspace.projectId ?? null) : null,
		hostUrl: hostHasRepo ? hostUrl : null,
		prNumber: ref.number,
		enabled: hostHasRepo,
	});
	const fromApi = cloudTrpc.integration.github.getPullRequest.useQuery(
		{
			organizationId: organizationId ?? "",
			repoFullName: ref.repoFullName,
			number: ref.number,
		},
		{
			// Until the projects have answered, which path applies is unknown.
			enabled: projectsReady && !hostHasRepo && organizationId !== null,
			staleTime: 30_000,
			refetchOnWindowFocus: true,
		},
	);
	return hostHasRepo ? fromHost : fromApi;
}
