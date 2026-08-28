import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { BACKFILL_DAYS, publishUsage } from "renderer/lib/leaderboard";
import {
	clearAutoPublishState,
	writeAutoPublishState,
} from "renderer/routes/_authenticated/components/LeaderboardAutoPublish/hooks/useLeaderboardAutoPublish/autoPublishState";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

export function useLeaderboardOptIn() {
	const { activeHostUrl, machineId } = useLocalHostService();

	const membership = useQuery({
		queryKey: ["leaderboard", "me"] as const,
		queryFn: () => apiTrpcClient.leaderboard.me.query({ period: "all" }),
		staleTime: 60_000,
		retry: false,
	});

	const [joining, setJoining] = useState(false);
	const [leaving, setLeaving] = useState(false);

	const join = useCallback(
		async (handle: string) => {
			setJoining(true);
			try {
				try {
					await apiTrpcClient.leaderboard.join.mutate({
						handle,
						visibility: "public",
					});
				} catch (error) {
					toast.error(errorMessage(error, "Couldn't join"));
					return false;
				}

				let published: number | null = 0;
				if (activeHostUrl && machineId) {
					try {
						published = (
							await publishUsage(activeHostUrl, machineId, BACKFILL_DAYS)
						).days;
						writeAutoPublishState({
							handle,
							lastPublishedAt: Date.now(),
							lastPayloadHash: null,
						});
					} catch {
						published = null;
					}
				}

				await membership.refetch();

				if (published === null) {
					toast.success(`Joined as ${handle}`);
					toast.error("Couldn't publish your usage yet — it'll retry shortly");
				} else {
					toast.success(
						published > 0
							? `Joined as ${handle} — published ${published} ${published === 1 ? "day" : "days"}`
							: `Joined as ${handle}`,
					);
				}
				return true;
			} finally {
				setJoining(false);
			}
		},
		[activeHostUrl, machineId, membership],
	);

	const leave = useCallback(async () => {
		setLeaving(true);
		try {
			await apiTrpcClient.leaderboard.leave.mutate();
			clearAutoPublishState();
			await membership.refetch();
			toast.success("Left the leaderboard and deleted your published usage");
			return true;
		} catch (error) {
			toast.error(errorMessage(error, "Couldn't leave"));
			return false;
		} finally {
			setLeaving(false);
		}
	}, [membership]);

	return {
		membership: membership.data ?? null,
		handle: membership.data?.handle ?? null,
		optedIn: Boolean(membership.data),
		isLoading: membership.isLoading,
		join,
		leave,
		joining,
		leaving,
	};
}
