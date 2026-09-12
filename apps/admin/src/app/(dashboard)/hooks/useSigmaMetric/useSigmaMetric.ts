"use client";

import {
	type QueryKey,
	type UseMutationOptions,
	type UseQueryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { useState } from "react";

/** Matches the server's reason for "a Sigma run is in flight". */
const COMPUTING_REASON = "computing";
const COMPUTING_POLL_MS = 10 * 1000;

type SigmaResult =
	| { available: true; dataLoadTime: string | null; dataThrough: string | null }
	| { available: false; reason: string };

// Holds the last landed result only across "computing": a refresh should not
// blank the tile, but a real failure should still surface.
export function useSigmaMetric<
	R extends SigmaResult,
	E extends { message: string },
	K extends QueryKey,
>({
	query,
	refresh,
}: {
	query: UseQueryOptions<R, E, R, K>;
	refresh: UseMutationOptions<R, E, void>;
}) {
	const queryClient = useQueryClient();
	const result = useQuery({
		...query,
		refetchInterval: (q) =>
			q.state.data && !q.state.data.available
				? q.state.data.reason === COMPUTING_REASON
					? COMPUTING_POLL_MS
					: false
				: false,
	});
	const mutation = useMutation({
		...refresh,
		onSettled: () =>
			queryClient.invalidateQueries({ queryKey: query.queryKey }),
	});

	const unavailableReason =
		result.data && !result.data.available ? result.data.reason : null;
	const isComputing = unavailableReason === COMPUTING_REASON;

	type Landed = Extract<R, { available: true }>;
	const [last, setLast] = useState<Landed | null>(null);
	if (result.data?.available && result.data !== last) {
		setLast(result.data as Landed);
	}

	return {
		data: result.data?.available || isComputing ? last : null,
		isLoading: result.isLoading,
		error: result.error,
		unavailableReason,
		isComputing,
		refresh: () => mutation.mutate(),
		isRefreshing: mutation.isPending || isComputing,
	};
}
