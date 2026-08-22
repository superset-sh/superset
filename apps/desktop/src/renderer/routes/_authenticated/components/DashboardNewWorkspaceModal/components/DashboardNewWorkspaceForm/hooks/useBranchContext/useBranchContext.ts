import type { AppRouter } from "@superset/host-service";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { useMemo } from "react";
import { useHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { CLOUD_HOST_ID } from "../../components/DevicePicker/DevicePicker";

type SearchBranchesInput =
	inferRouterInputs<AppRouter>["workspaceCreation"]["searchBranches"];
type SearchBranchesOutput =
	inferRouterOutputs<AppRouter>["workspaceCreation"]["searchBranches"];

export type BranchFilter = NonNullable<SearchBranchesInput["filter"]>;
export type BranchRow = SearchBranchesOutput["items"][number];
type BranchPage = SearchBranchesOutput;

const PAGE_SIZE = 50;

/**
 * Paginated branch search via host-service. First page of a
 * (projectId, host, query, filter) tuple asks to refresh remote refs;
 * the host-service enforces a TTL so rapid typing doesn't thrash `git fetch`.
 */
export function useBranchContext(
	projectId: string | null,
	hostId: string | null,
	query: string,
	filter: BranchFilter = "all",
) {
	// A cloud workspace has no host to search — the sandbox doesn't exist until
	// create — so its branches come from the GitHub remote instead.
	const isCloud = hostId === CLOUD_HOST_ID;
	const hostUrl = useHostUrl(isCloud ? null : hostId);
	const organizationId = useActiveOrganizationId();
	// Resolve the repo first: branches are read from GitHub by owner/name, not
	// from a project id, since a cloud workspace has no checkout to enumerate.
	const cloudRepo = cloudTrpc.cloudWorkspace.repoForProject.useQuery(
		{ organizationId: organizationId ?? "", projectId: projectId ?? "" },
		{ enabled: isCloud && !!organizationId && !!projectId },
	);
	// Read through the local host's `gh` — the same path issue and PR lookups
	// take — so it uses the user's own auth rather than an App installation.
	const localHostUrl = useHostUrl(null);
	const cloudBranches = useQuery({
		queryKey: [
			"cloudBranches",
			localHostUrl,
			cloudRepo.data?.owner,
			cloudRepo.data?.name,
			query,
		],
		enabled:
			isCloud &&
			!!localHostUrl &&
			!!cloudRepo.data?.owner &&
			!!cloudRepo.data?.name,
		queryFn: async () => {
			const client = getHostServiceClientByUrl(localHostUrl as string);
			return client.workspaceCreation.searchRemoteBranches.query({
				owner: cloudRepo.data?.owner as string,
				repo: cloudRepo.data?.name as string,
				query: query || undefined,
			});
		},
	});

	const q = useInfiniteQuery({
		queryKey: [
			"workspaceCreation",
			"searchBranches",
			projectId,
			hostUrl,
			query,
			filter,
		],
		enabled: !isCloud && !!projectId && !!hostUrl,
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (last: BranchPage) => last.nextCursor ?? undefined,
		queryFn: async ({ pageParam }): Promise<BranchPage> => {
			if (!hostUrl || !projectId) {
				return { defaultBranch: null, items: [], nextCursor: null };
			}
			const client = getHostServiceClientByUrl(hostUrl);
			return client.workspaceCreation.searchBranches.query({
				projectId,
				query: query || undefined,
				cursor: pageParam,
				limit: PAGE_SIZE,
				refresh: pageParam === undefined,
				filter,
			});
		},
	});

	const cloudRows = useMemo<BranchRow[]>(
		() =>
			(cloudBranches.data?.items ?? []).map((name) => ({
				name,
				lastCommitDate: 0,
				isLocal: false,
				isRemote: true,
				recency: null,
				worktreePath: null,
				hasWorkspace: false,
				isCheckedOut: false,
			})),
		[cloudBranches.data],
	);

	const pages = q.data?.pages as BranchPage[] | undefined;
	const branches = useMemo<BranchRow[]>(
		() => pages?.flatMap((p) => p.items) ?? [],
		[pages],
	);

	const defaultBranch = pages?.[0]?.defaultBranch ?? null;

	if (isCloud) {
		return {
			branches: cloudRows,
			defaultBranch: cloudRepo.data?.defaultBranch ?? null,
			isLoading: cloudBranches.isLoading,
			isError: cloudBranches.isError,
			isFetchingNextPage: false,
			hasNextPage: false,
			fetchNextPage: () => {},
		};
	}

	return {
		branches,
		defaultBranch,
		isLoading: q.isLoading,
		isError: q.isError,
		isFetchingNextPage: q.isFetchingNextPage,
		hasNextPage: q.hasNextPage,
		fetchNextPage: q.fetchNextPage,
	};
}
