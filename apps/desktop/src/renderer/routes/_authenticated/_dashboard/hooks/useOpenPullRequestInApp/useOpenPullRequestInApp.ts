import { useNavigate } from "@tanstack/react-router";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getPullRequestTarget } from "renderer/lib/github/getPullRequestTarget";
import { usePullRequestsSplitViewStore } from "renderer/routes/_authenticated/_dashboard/pull-requests/stores/pullRequestsSplitViewStore";

export function useOpenPullRequestInApp() {
	const navigate = useNavigate();
	const { projects } = useHostProjects();
	const openUrl = electronTrpc.external.openUrl.useMutation();
	return (url: string) => {
		const target = getPullRequestTarget(url, projects);
		if (target) {
			usePullRequestsSplitViewStore.getState().expandDetail();
			void navigate({
				to: "/pull-requests/$prNumber",
				params: { prNumber: String(target.ref.number) },
				search: {
					project: target.projectId ?? undefined,
					repo: target.ref.repoFullName,
				},
			});
			return;
		}
		openUrl.mutate(url);
	};
}
