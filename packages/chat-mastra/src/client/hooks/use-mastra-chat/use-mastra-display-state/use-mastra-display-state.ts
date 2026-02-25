import { chatMastraServiceTrpc } from "../../../provider";
import type {
	MastraDisplayStateContract,
	UseMastraDisplayStateOptions,
	UseMastraDisplayStateReturn,
} from "../types";

function toRefetchIntervalMs(fps: number): number {
	if (!Number.isFinite(fps) || fps <= 0) return Math.floor(1000 / 60);
	return Math.max(16, Math.floor(1000 / fps));
}

export function useMastraDisplayState(
	options: UseMastraDisplayStateOptions,
): UseMastraDisplayStateReturn {
	const query = chatMastraServiceTrpc.session.getDisplayState.useQuery(
		{ sessionId: options.sessionId },
		{
			enabled: options.enabled ?? true,
			refetchInterval: toRefetchIntervalMs(options.fps ?? 60),
			refetchIntervalInBackground: true,
			refetchOnWindowFocus: false,
			staleTime: 0,
			gcTime: 0,
		},
	);

	const ready = query.data?.ready ?? false;
	const reason = query.data?.reason ?? null;
	const displayState = ready
		? (query.data?.displayState as MastraDisplayStateContract)
		: null;

	return {
		ready,
		displayState,
		reason,
		isLoading: query.isLoading,
		error: query.error,
		refetch: query.refetch,
	};
}
