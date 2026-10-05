import { useNavigate } from "@tanstack/react-router";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { pullRequestRefFromUrl } from "renderer/lib/github/pullRequestRef";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { usePullRequestPaneIntent } from "renderer/stores/pull-request-pane-intent";

export function useOpenCloudWorkspacePullRequest() {
	const navigate = useNavigate();
	const openUrl = electronTrpc.external.openUrl.useMutation();
	return (workspaceId: string, url: string) => {
		const ref = pullRequestRefFromUrl(url);
		if (!ref) {
			openUrl.mutate(url);
			return;
		}
		usePullRequestPaneIntent.getState().request({ workspaceId, ...ref });
		void navigateToV2Workspace(workspaceId, navigate);
	};
}
