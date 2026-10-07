import { parseGitRemote } from "@superset/shared/git-remote";
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
		provider?: "github" | "gitlab";
		expectedUrl?: string;
	}>();
	const { id, pullRequestId } = params;
	const workspaceId = id ?? null;
	const parsed = Number(pullRequestId);
	const nativePullNumber =
		/^[1-9]\d*$/.test(pullRequestId ?? "") && Number.isSafeInteger(parsed)
			? parsed
			: null;
	const workspaceRepo = useWorkspaceRepo(workspaceId);
	// The history sheet passes the entry's own coordinates: an old entry can
	// predate a remote rename, and the workspace's current repo would then
	// resolve the number against the wrong repository.
	const hasExplicitRepo = Boolean(params.owner && params.repo);
	const owner = hasExplicitRepo ? (params.owner ?? null) : workspaceRepo.owner;
	const repo = hasExplicitRepo ? (params.repo ?? null) : workspaceRepo.repo;
	const claimedGitlab =
		params.provider === "gitlab" ||
		params.expectedUrl !== undefined ||
		(!hasExplicitRepo && params.provider !== "github" && workspaceRepo.repoUrl
			? parseGitRemote(workspaceRepo.repoUrl)?.provider === "gitlab"
			: false);
	const legacyNumber = pullRequestId ? Number.parseInt(pullRequestId, 10) : NaN;
	const pullNumber = claimedGitlab
		? nativePullNumber
		: Number.isNaN(legacyNumber)
			? null
			: legacyNumber;
	const detail = useWorkspacePullRequestDetail({
		workspaceId,
		owner: claimedGitlab ? (params.owner ?? owner) : owner,
		repo: claimedGitlab ? (params.repo ?? repo) : repo,
		pullNumber,
		...(claimedGitlab
			? {
					provider: params.provider ?? ("gitlab" as const),
					projectId: workspaceRepo.projectId,
					repoUrl: workspaceRepo.repoUrl,
					isRepoReady: workspaceRepo.isReady,
					expectedUrl: params.expectedUrl,
				}
			: {}),
	});
	return { workspaceId, pullNumber, owner, repo, ...detail };
}
