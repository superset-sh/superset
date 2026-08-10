import {
	type Query,
	type UseQueryOptions,
	type UseQueryResult,
	useQueries,
} from "@tanstack/react-query";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { combineQueryResults } from "renderer/routes/_authenticated/_dashboard/utils/mergePaginatedProjectRows";
import { shouldKeepWorkItemsPlaceholder } from "renderer/routes/_authenticated/_dashboard/utils/shouldKeepWorkItemsPlaceholder";

interface PaginatedQueryData {
	hasNextPage: boolean;
}

export interface PaginationTarget {
	key: string;
	hostUrl: string | null;
}

export interface PaginatedQueryTarget<TTarget extends PaginationTarget> {
	target: TTarget;
	page: number;
}

interface MultiRepoProjectPaginationOptions<
	TData extends PaginatedQueryData,
	TTarget extends PaginationTarget,
> {
	targets: TTarget[];
	resetKey: string;
	getQueryOptions: (
		queryTarget: PaginatedQueryTarget<TTarget>,
	) => UseQueryOptions<TData | null, Error>;
}

interface MultiRepoProjectPaginationResult<
	TData extends PaginatedQueryData,
	TTarget extends PaginationTarget,
> {
	queries: UseQueryResult<TData | null, Error>[];
	queryTargets: PaginatedQueryTarget<TTarget>[];
	isFetching: boolean;
	isFetchingNextPage: boolean;
	hasNextPage: boolean;
	error: Error | null;
	refetch: () => Promise<unknown[]>;
	scrollRef: RefObject<HTMLDivElement | null>;
	sentinelRef: RefObject<HTMLDivElement | null>;
}

export function buildPaginatedQueryTargets<TTarget extends PaginationTarget>(
	targets: TTarget[],
	pageCountByTarget: Readonly<Record<string, number>>,
): PaginatedQueryTarget<TTarget>[] {
	return targets.flatMap((target) => {
		const pageCount = pageCountByTarget[target.key] ?? 1;
		return Array.from({ length: pageCount }, (_, index) => ({
			target,
			page: index + 1,
		}));
	});
}

export function useMultiRepoProjectPagination<
	TData extends PaginatedQueryData,
	TTarget extends PaginationTarget,
>({
	targets,
	resetKey,
	getQueryOptions,
}: MultiRepoProjectPaginationOptions<
	TData,
	TTarget
>): MultiRepoProjectPaginationResult<TData, TTarget> {
	const targetsKey = targets
		.map(({ key, hostUrl }) => `${key}:${hostUrl ?? ""}`)
		.join("\0");
	const paginationKey = `${targetsKey}\0${resetKey}`;
	const [pagination, setPagination] = useState<{
		key: string;
		pageCountByTarget: Record<string, number>;
	}>({ key: paginationKey, pageCountByTarget: {} });
	const pageCountByTarget =
		pagination.key === paginationKey ? pagination.pageCountByTarget : {};
	const queryTargets = useMemo(
		() => buildPaginatedQueryTargets(targets, pageCountByTarget),
		[pageCountByTarget, targets],
	);
	// Keep the previous rows for the same target visible while a changed
	// search/filter refetches, instead of blanking the list to a spinner.
	const queryOptions = queryTargets.map((queryTarget) => ({
		...getQueryOptions(queryTarget),
		placeholderData: (
			previousData: TData | null | undefined,
			previousQuery: Query<TData | null, Error> | undefined,
		) =>
			shouldKeepWorkItemsPlaceholder(
				previousQuery?.queryKey,
				queryTarget.target.key,
				queryTarget.target.hostUrl,
			)
				? previousData
				: undefined,
	}));
	const queries = useQueries({
		queries: queryOptions,
		combine: combineQueryResults,
	});
	const isFetching = queries.some((query) => query.isFetching);
	const error = queries.find((query) => query.error)?.error ?? null;
	const latestTargetQueries = targets.map((target) => {
		const page = pageCountByTarget[target.key] ?? 1;
		const index = queryTargets.findIndex(
			(queryTarget) =>
				queryTarget.target.key === target.key && queryTarget.page === page,
		);
		return { target, page, query: queries[index] };
	});
	const isFetchingNextPage = latestTargetQueries.some(
		({ page, query }) => page > 1 && query?.isFetching,
	);
	const expandableTargetKeys = latestTargetQueries.flatMap(
		({ target, query }) => (query?.data?.hasNextPage ? [target.key] : []),
	);
	const expandableTargetKeysRef = useRef(expandableTargetKeys);
	expandableTargetKeysRef.current = expandableTargetKeys;
	const expandableTargetKeysKey = expandableTargetKeys.join("\0");
	const hasNextPage = expandableTargetKeysKey.length > 0;
	const scrollRef = useRef<HTMLDivElement>(null);
	const sentinelRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const sentinel = sentinelRef.current;
		const scrollContainer = scrollRef.current;
		if (
			!sentinel ||
			!scrollContainer ||
			!expandableTargetKeysKey ||
			isFetchingNextPage
		) {
			return;
		}
		const observer = new IntersectionObserver(
			(entries) => {
				if (!entries[0]?.isIntersecting) return;
				setPagination((current) => {
					const currentPageCounts =
						current.key === paginationKey ? current.pageCountByTarget : {};
					const next = { ...currentPageCounts };
					for (const targetKey of expandableTargetKeysRef.current) {
						next[targetKey] = (currentPageCounts[targetKey] ?? 1) + 1;
					}
					return { key: paginationKey, pageCountByTarget: next };
				});
			},
			{ root: scrollContainer, rootMargin: "200px" },
		);
		observer.observe(sentinel);
		return () => observer.disconnect();
	}, [expandableTargetKeysKey, isFetchingNextPage, paginationKey]);

	return {
		queries,
		queryTargets,
		isFetching,
		isFetchingNextPage,
		hasNextPage,
		error,
		refetch: () => Promise.all(queries.map((query) => query.refetch())),
		scrollRef,
		sentinelRef,
	};
}
