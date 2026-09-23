import { useEffect, useMemo, useRef } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import {
	type PagesListFilter,
	pagesListInput,
} from "renderer/routes/_authenticated/_dashboard/utils/pagesListInput";

/**
 * One batch per scroll. Attach `scrollRef` to the scroll container and
 * `sentinelRef` to an element after the last row; nothing fetches ahead of
 * what the viewer has reached.
 */
export function usePagesList(
	filter: PagesListFilter = {},
	options: { enabled?: boolean; staleTime?: number } = {},
) {
	const query = cloudTrpc.page.listPaginated.useInfiniteQuery(
		pagesListInput(filter),
		{
			getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
			...options,
		},
	);

	const {
		hasNextPage,
		isFetchingNextPage,
		isFetchNextPageError,
		fetchNextPage,
	} = query;

	const scrollRef = useRef<HTMLDivElement>(null);
	const sentinelRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const sentinel = sentinelRef.current;
		const root = scrollRef.current;
		// React Query derives `hasNextPage` from the last successful fetch, so a
		// failed batch leaves it true — observing again would spin. The caller
		// offers a retry instead.
		if (
			!sentinel ||
			!root ||
			!hasNextPage ||
			isFetchingNextPage ||
			isFetchNextPageError
		) {
			return;
		}
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) void fetchNextPage();
			},
			{ root, rootMargin: "200px" },
		);
		observer.observe(sentinel);
		return () => observer.disconnect();
	}, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage]);

	const items = useMemo(
		() => query.data?.pages.flatMap((page) => page.items) ?? [],
		[query.data],
	);

	return { ...query, items, scrollRef, sentinelRef };
}
