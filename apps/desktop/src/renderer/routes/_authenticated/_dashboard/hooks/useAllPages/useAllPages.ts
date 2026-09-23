import { useEffect, useMemo } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import {
	type PagesListFilter,
	pagesListInput,
} from "renderer/routes/_authenticated/_dashboard/utils/pagesListInput";

export function useAllPages(
	filter: PagesListFilter = {},
	options: { enabled?: boolean; staleTime?: number } = {},
) {
	const query = cloudTrpc.page.list.useInfiniteQuery(pagesListInput(filter), {
		getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
		...options,
	});

	const {
		hasNextPage,
		isFetchingNextPage,
		isFetchNextPageError,
		fetchNextPage,
	} = query;

	useEffect(() => {
		if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError) {
			void fetchNextPage();
		}
	}, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage]);

	const items = useMemo(
		() => query.data?.pages.flatMap((page) => page.items) ?? [],
		[query.data],
	);

	return { ...query, items, isIncomplete: isFetchNextPageError };
}
