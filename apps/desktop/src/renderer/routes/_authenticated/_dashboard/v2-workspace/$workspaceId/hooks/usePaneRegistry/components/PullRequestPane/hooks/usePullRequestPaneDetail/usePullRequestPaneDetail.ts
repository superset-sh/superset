import { useLingui } from "@lingui/react/macro";
import { workspaceTrpc } from "@superset/workspace-client";
import { getPullRequestTarget } from "renderer/lib/github/getPullRequestTarget";
import {
	isSamePullRequest,
	PullRequestIdentityError,
	type PullRequestRef,
	pullRequestRefFromUrl,
} from "renderer/lib/github/pullRequestRef";
import { usePullRequestDetail } from "renderer/routes/_authenticated/_dashboard/pull-requests/hooks/usePullRequestDetail";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";

export function usePullRequestPaneDetail(ref: PullRequestRef) {
	const { t } = useLingui();
	const { workspace, hostUrl } = useWorkspace();
	const isGitlab = ref.provider === "gitlab";
	const workspaceProjects = workspaceTrpc.project.list.useQuery(undefined, {
		enabled: isGitlab,
	});
	const projectQuery = workspaceTrpc.project.get.useQuery(
		{ projectId: workspace.projectId ?? "" },
		{ enabled: !isGitlab && !!workspace.projectId },
	);
	const workspaceProject = workspaceProjects.data?.find(
		(candidate) => candidate.id === workspace.projectId,
	);
	const target =
		isGitlab && ref.host && workspaceProject
			? getPullRequestTarget(
					`https://${ref.host}/${ref.repoFullName}/-/merge_requests/${ref.number}`,
					[{ ...workspaceProject, projectKey: workspaceProject.id }],
				)
			: null;
	const gitlabHostHasRepo =
		!!target?.projectId && isSamePullRequest(target.ref, ref);
	const detail = usePullRequestDetail({
		projectId: isGitlab
			? gitlabHostHasRepo
				? workspace.projectId
				: null
			: (workspace.projectId ?? null),
		projectQuery: isGitlab
			? { data: workspaceProject, isPending: workspaceProjects.isPending }
			: projectQuery,
		hostUrl,
		repoFullName: ref.repoFullName,
		prNumber: ref.number,
		enabled: !isGitlab || gitlabHostHasRepo,
		...(isGitlab ? { expectedRef: ref } : {}),
	});
	if (!isGitlab) return { ...detail, isFromHost: !!detail.projectId };
	if (workspaceProjects.isPending || workspaceProjects.error)
		return {
			...detail,
			...workspaceProjects,
			isLoading: workspaceProjects.isPending,
			data: undefined,
			projectId: null,
			isFromHost: false,
		};
	if (
		gitlabHostHasRepo &&
		detail.isError &&
		!(detail.error instanceof PullRequestIdentityError)
	)
		return { ...detail, isFromHost: true };
	const returnedRef = detail.data?.url
		? pullRequestRefFromUrl(detail.data.url)
		: null;
	if (
		!gitlabHostHasRepo ||
		detail.error instanceof PullRequestIdentityError ||
		(detail.data && (!returnedRef || !isSamePullRequest(returnedRef, ref)))
	)
		return {
			...detail,
			data: undefined,
			projectId: null,
			error: new Error(t({ message: "Pull request not found." })),
			isError: true,
			isSuccess: false,
			isLoading: false,
			isPending: false,
			status: "error" as const,
			isFromHost: false,
			refetch: gitlabHostHasRepo ? detail.refetch : workspaceProjects.refetch,
		};
	return { ...detail, isFromHost: true };
}
