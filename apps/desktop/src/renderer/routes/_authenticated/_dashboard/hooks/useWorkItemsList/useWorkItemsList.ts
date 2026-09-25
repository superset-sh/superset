import type { UseQueryOptions } from "@tanstack/react-query";
import { type RefObject, useMemo } from "react";
import {
	type PaginatedQueryTarget,
	useMultiRepoProjectPagination,
} from "renderer/routes/_authenticated/_dashboard/hooks/useMultiRepoProjectPagination";
import {
	groupProjectTargetsByHost,
	type HostQueryTarget,
	type ProjectQueryTarget,
} from "renderer/routes/_authenticated/_dashboard/hooks/useProjectQueryTargets";
import { getRepositoryMismatchLabel } from "renderer/routes/_authenticated/_dashboard/utils/getRepositoryMismatchLabel";
import { mergePaginatedProjectRows } from "renderer/routes/_authenticated/_dashboard/utils/mergePaginatedProjectRows";

interface WorkItemsPage {
	totalCount: number;
	hasNextPage: boolean;
	repoMismatch?: string;
}

interface WorkItemRow {
	projectId: string;
	updatedAt: string | null;
}

export type AttributedWorkItemRow<TRow> = TRow & {
	projectName: string;
	hostId: string | null;
	hostUrl: string | null;
};

interface UseWorkItemsListOptions<
	TData extends WorkItemsPage,
	TRow extends WorkItemRow,
> {
	projectTargets: ProjectQueryTarget[];
	resetKey: string;
	getQueryOptions: (
		queryTarget: PaginatedQueryTarget<HostQueryTarget>,
	) => UseQueryOptions<TData | null, Error>;
	getRows: (data: TData) => readonly TRow[];
	getRowKey: (row: TRow) => string;
}

interface UseWorkItemsListResult<TRow> {
	rows: AttributedWorkItemRow<TRow>[];
	totalCount: number;
	repoMismatch: string | null;
	isFetching: boolean;
	isFetchingNextPage: boolean;
	hasNextPage: boolean;
	error: Error | null;
	refetch: () => Promise<unknown[]>;
	scrollRef: RefObject<HTMLDivElement | null>;
	sentinelRef: RefObject<HTMLDivElement | null>;
}

/**
 * Shared engine for the multi-repo PR/issue lists: groups project targets
 * by serving host (one batched search per host), paginates, and merges the
 * per-page results into attributed, deduplicated rows.
 */
export function useWorkItemsList<
	TData extends WorkItemsPage,
	TRow extends WorkItemRow,
>({
	projectTargets,
	resetKey,
	getQueryOptions,
	getRows,
	getRowKey,
}: UseWorkItemsListOptions<TData, TRow>): UseWorkItemsListResult<TRow> {
	const hostTargets = useMemo(
		() => groupProjectTargetsByHost(projectTargets),
		[projectTargets],
	);
	const projectNameById = useMemo(
		() =>
			new Map(
				projectTargets.map((target) => [target.projectId, target.projectName]),
			),
		[projectTargets],
	);
	const {
		queries,
		queryTargets,
		isFetching,
		isFetchingNextPage,
		hasNextPage,
		error,
		refetch,
		scrollRef,
		sentinelRef,
	} = useMultiRepoProjectPagination({
		targets: hostTargets,
		resetKey,
		getQueryOptions,
	});

	const rows = useMemo(
		() =>
			mergePaginatedProjectRows({
				pages: queries.map((query, index) => {
					const target = queryTargets[index]?.target;
					const page = queryTargets[index]?.page ?? 1;
					return {
						page,
						isPending: query.isFetching && !query.data && !query.error,
						rows:
							target && query.data
								? getRows(query.data).map((row) => ({
										...row,
										projectName:
											projectNameById.get(row.projectId) ?? row.projectId,
										hostId: target.hostId,
										hostUrl: target.hostUrl,
									}))
								: [],
					};
				}),
				getKey: getRowKey,
				getUpdatedAt: (row) => row.updatedAt,
			}),
		[queries, queryTargets, projectNameById, getRows, getRowKey],
	);
	const totalCount = queries.reduce((total, query, index) => {
		return queryTargets[index]?.page === 1
			? total + (query.data?.totalCount ?? 0)
			: total;
	}, 0);
	const repoMismatch = getRepositoryMismatchLabel(
		queries.flatMap((query, index) =>
			queryTargets[index]?.target.hostUrl ? [query.data] : [],
		),
		rows.length,
	);

	return {
		rows,
		totalCount,
		repoMismatch,
		isFetching,
		isFetchingNextPage,
		hasNextPage,
		error,
		refetch,
		scrollRef,
		sentinelRef,
	};
}
