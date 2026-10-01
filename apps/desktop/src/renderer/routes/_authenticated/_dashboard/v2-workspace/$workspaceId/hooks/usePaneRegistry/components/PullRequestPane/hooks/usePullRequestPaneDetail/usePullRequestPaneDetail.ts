import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import type { PullRequestRef } from "renderer/lib/github/pullRequestRef";
import { usePullRequestDetail } from "renderer/routes/_authenticated/_dashboard/pull-requests/hooks/usePullRequestDetail";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";

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
	const provider = ref.provider ?? "github";
	const project = projects.find(
		(candidate) => candidate.id === workspace.projectId,
	);
	const hostHasRepo =
		(project?.provider ?? "github") === provider &&
		!!project?.repoOwner &&
		!!project.repoName &&
		`${project.repoOwner}/${project.repoName}`.toLowerCase() ===
			(ref.repoPath ?? ref.repoFullName).toLowerCase() &&
		(provider === "github" ||
			project.instance?.toLowerCase() === ref.instance?.toLowerCase());
	const useHost = provider === "gitlab" || hostHasRepo;

	const fromHost = usePullRequestDetail({
		projectId: useHost ? (workspace.projectId ?? null) : null,
		hostUrl: useHost ? hostUrl : null,
		prNumber: ref.number,
		provider,
		instance: ref.instance,
		repoPath: ref.repoPath ?? ref.repoFullName,
		enabled: useHost,
	});
	const fromApi = cloudTrpc.integration.github.getPullRequest.useQuery(
		{
			organizationId: organizationId ?? "",
			repoFullName: ref.repoFullName,
			number: ref.number,
		},
		{
			// Until the projects have answered, which path applies is unknown.
			enabled:
				provider === "github" &&
				projectsReady &&
				!hostHasRepo &&
				organizationId !== null,
			staleTime: 30_000,
			refetchOnWindowFocus: true,
		},
	);
	return {
		...(useHost ? fromHost : fromApi),
		isFromHost: hostHasRepo,
	};
}
