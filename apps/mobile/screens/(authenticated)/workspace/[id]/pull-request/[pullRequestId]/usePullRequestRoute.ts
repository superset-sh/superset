import { useLocalSearchParams } from "expo-router";
import { useWorkspacePullRequestDetail } from "../../hooks/useWorkspacePullRequestDetail";
import { useWorkspaceRepo } from "../../hooks/useWorkspaceRepo";

/**
 * The pull request behind whichever of these routes is showing. The sheets are
 * separate routes, so each reads the same query rather than being handed the
 * data — react-query serves them all from one cache entry.
 */
export function usePullRequestRoute() {
	const params = useLocalSearchParams<{
		id: string;
		pullRequestId: string;
		owner?: string;
		repo?: string;
	}>();
	const { id, pullRequestId } = params;
	const workspaceId = id ?? null;
	const parsed = Number.parseInt(pullRequestId ?? "", 10);
	const pullNumber = Number.isNaN(parsed) ? null : parsed;
	const workspaceRepo = useWorkspaceRepo(workspaceId);
	// The history sheet passes the entry's own coordinates: an old entry can
	// predate a remote rename, and the workspace's current repo would then
	// resolve the number against the wrong repository.
	const hasExplicitRepo = Boolean(params.owner && params.repo);
	const owner = hasExplicitRepo ? (params.owner ?? null) : workspaceRepo.owner;
	const repo = hasExplicitRepo ? (params.repo ?? null) : workspaceRepo.repo;
	const detail = useWorkspacePullRequestDetail({
		workspaceId,
		owner,
		repo,
		pullNumber,
	});
	return { workspaceId, pullNumber, owner, repo, ...detail };
}
