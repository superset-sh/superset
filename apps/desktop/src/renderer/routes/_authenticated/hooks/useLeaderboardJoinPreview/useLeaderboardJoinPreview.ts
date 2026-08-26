import { toast } from "@superset/ui/sonner";
import { useCallback, useState } from "react";
import type { LeaderboardPreview } from "renderer/components/LeaderboardJoinDialog";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { buildPayload, PREVIEW_DAYS } from "renderer/lib/leaderboard";

const FALLBACK_PROVIDERS = ["Claude", "Codex"];

export function useLeaderboardJoinPreview(hostUrl: string | null) {
	const [preview, setPreview] = useState<LeaderboardPreview | null>(null);
	const [suggestedHandle, setSuggestedHandle] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);

	const load = useCallback(async () => {
		setIsLoading(true);
		try {
			const [suggestion, payload] = await Promise.all([
				apiTrpcClient.leaderboard.suggestedHandle.query(),
				hostUrl
					? buildPayload(hostUrl, PREVIEW_DAYS)
					: Promise.resolve({ days: [] }),
			]);
			setSuggestedHandle(suggestion.taken ? null : suggestion.handle);

			const tokens = payload.days.reduce(
				(sum, day) =>
					sum +
					day.uncachedInput +
					day.cachedInput +
					day.cacheWrite5m +
					day.cacheWrite1h +
					day.output,
				0,
			);
			const providers = [...new Set(payload.days.map((day) => day.provider))];
			const rank = await apiTrpcClient.leaderboard.previewRank.query({
				period: "30d",
				tokens,
			});

			setPreview({
				rank: rank.rank,
				total: rank.total,
				tokens,
				providers: providers.length > 0 ? providers : FALLBACK_PROVIDERS,
			});
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Couldn't read local usage",
			);
		} finally {
			setIsLoading(false);
		}
	}, [hostUrl]);

	return { preview, suggestedHandle, isLoading, load };
}
