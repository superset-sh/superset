import { useLocalSearchParams } from "expo-router";
import { useWorkspacePullRequestDetail } from "../../hooks/useWorkspacePullRequestDetail";
import { useWorkspaceRepo } from "../../hooks/useWorkspaceRepo";

/**
 * The pull request behind whichever of these routes is showing. The sheets are
 * separate routes, so each reads the same query rather than being handed the
 * data — react-query serves them all from one cache entry.
 */
export function usePullRequestRoute() {
	const { id, pullRequestId } = useLocalSearchParams<{
		id: string;
		pullRequestId: string;
	}>();
	const workspaceId = id ?? null;
	const parsed = Number.parseInt(pullRequestId ?? "", 10);
	const pullNumber = Number.isNaN(parsed) ? null : parsed;
	const { owner, repo } = useWorkspaceRepo(workspaceId);
	const detail = useWorkspacePullRequestDetail({
		workspaceId,
		owner,
		repo,
		pullNumber,
	});
	return { workspaceId, pullNumber, owner, repo, ...detail };
}
