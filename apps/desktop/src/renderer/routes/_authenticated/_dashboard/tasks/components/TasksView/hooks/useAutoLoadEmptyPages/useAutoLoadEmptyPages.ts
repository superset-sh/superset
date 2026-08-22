import { useEffect, useRef } from "react";

const MAX_EMPTY_PAGE_LOADS = 5;

interface UseAutoLoadEmptyPagesParams {
	isEmpty: boolean;
	isLoading: boolean;
	filterKey: string;
	hasNextPage: boolean;
	isFetchingNextPage: boolean;
	onLoadMore: () => void;
}

/**
 * Filters run client-side: a page can yield zero rows while later pages hold
 * matches, and an empty list has nothing to scroll for the sentinel to catch.
 */
export function useAutoLoadEmptyPages({
	isEmpty,
	isLoading,
	filterKey,
	hasNextPage,
	isFetchingNextPage,
	onLoadMore,
}: UseAutoLoadEmptyPagesParams) {
	const loads = useRef({ filterKey, count: 0 });

	useEffect(() => {
		if (loads.current.filterKey !== filterKey) {
			loads.current = { filterKey, count: 0 };
		}
		if (!isEmpty) {
			loads.current.count = 0;
			return;
		}
		if (isLoading || !hasNextPage || isFetchingNextPage) return;
		if (loads.current.count >= MAX_EMPTY_PAGE_LOADS) return;
		loads.current.count += 1;
		onLoadMore();
	}, [
		filterKey,
		hasNextPage,
		isEmpty,
		isFetchingNextPage,
		isLoading,
		onLoadMore,
	]);
}
