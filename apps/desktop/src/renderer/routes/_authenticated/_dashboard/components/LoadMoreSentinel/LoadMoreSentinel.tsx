import { Trans } from "@lingui/react/macro";
import type { RefObject } from "react";
import { LuRefreshCw } from "react-icons/lu";

interface LoadMoreSentinelProps {
	sentinelRef: RefObject<HTMLDivElement | null>;
	hasNextPage: boolean;
	isFetchingNextPage: boolean;
}

/**
 * Infinite-scroll sentinel row. Stays mounted while the next page fetches:
 * hasNextPage reads the in-flight page's data, so it goes false mid-fetch.
 */
export function LoadMoreSentinel({
	sentinelRef,
	hasNextPage,
	isFetchingNextPage,
}: LoadMoreSentinelProps) {
	if (!hasNextPage && !isFetchingNextPage) return null;
	return (
		<div
			ref={sentinelRef}
			className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground"
		>
			{isFetchingNextPage && (
				<>
					<LuRefreshCw className="size-3.5 animate-spin motion-reduce:animate-none" />
					<span>
						<Trans>Loading more…</Trans>
					</span>
				</>
			)}
		</div>
	);
}
