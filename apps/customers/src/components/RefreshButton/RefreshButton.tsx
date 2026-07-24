import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LuRefreshCw } from "react-icons/lu";

import { useTRPC } from "@/trpc/react";

/**
 * Busts the server's 15-minute data memos and refetches everything on
 * screen — for when you need a brand-new signup or subscription right now.
 */
export function RefreshButton() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	const refresh = useMutation(
		trpc.customers.refreshData.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries();
				toast.success("Data refreshed");
			},
			onError: (error) => {
				toast.error(`Refresh failed: ${error.message}`);
			},
		}),
	);

	return (
		<Button
			variant="ghost"
			size="sm"
			disabled={refresh.isPending}
			onClick={() => refresh.mutate()}
			title="Refresh data (busts the 15-minute server cache)"
		>
			<LuRefreshCw className={refresh.isPending ? "animate-spin" : undefined} />
			Refresh
		</Button>
	);
}
