import { workspaceTrpc } from "@superset/workspace-client";
import type { PullRequestRef } from "renderer/lib/github/pullRequestRef";
import { usePullRequestDetail } from "renderer/routes/_authenticated/_dashboard/pull-requests/hooks/usePullRequestDetail";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";

export function usePullRequestPaneDetail(ref: PullRequestRef) {
	const { workspace, hostUrl } = useWorkspace();
	const projectQuery = workspaceTrpc.project.get.useQuery(
		{ projectId: workspace.projectId ?? "" },
		{ enabled: !!workspace.projectId },
	);
	return usePullRequestDetail({
		projectId: workspace.projectId ?? null,
		projectQuery,
		hostUrl,
		repoFullName: ref.repoFullName,
		prNumber: ref.number,
	});
}
