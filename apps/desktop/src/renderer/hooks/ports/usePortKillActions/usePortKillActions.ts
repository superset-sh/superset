import { toast } from "@superset/ui/sonner";
import { type QueryKey, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import {
	killPortTarget,
	type LocalPortKill,
	type PortKillResult,
	type PortKillTarget,
} from "./killPortTarget";

interface UsePortKillActionsOptions {
	localKill?: LocalPortKill;
	refreshQueryKey?: QueryKey;
	externalPending?: boolean;
}

function getFailureDescription(result: PortKillResult): string | undefined {
	return result.error && result.error.length > 0 ? result.error : undefined;
}

export function usePortKillActions<TPort extends PortKillTarget>({
	localKill,
	refreshQueryKey,
	externalPending = false,
}: UsePortKillActionsOptions = {}) {
	const queryClient = useQueryClient();
	const [pendingCount, setPendingCount] = useState(0);

	const refreshPorts = useCallback(async () => {
		if (!refreshQueryKey) return;
		try {
			await queryClient.invalidateQueries({ queryKey: refreshQueryKey });
		} catch (error) {
			console.error("[ports] Failed to refresh ports after kill:", error);
		}
	}, [queryClient, refreshQueryKey]);

	const killPort = useCallback(
		async (port: TPort): Promise<PortKillResult> => {
			setPendingCount((count) => count + 1);
			try {
				const result = await killPortTarget(port, localKill);
				if (!result.success) {
					toast.error(`Failed to close port ${port.port}`, {
						description: getFailureDescription(result),
					});
				}
				return result;
			} finally {
				await refreshPorts();
				setPendingCount((count) => Math.max(0, count - 1));
			}
		},
		[localKill, refreshPorts],
	);

	const killPorts = useCallback(
		async (ports: TPort[]): Promise<PortKillResult[]> => {
			if (ports.length === 0) return [];

			setPendingCount((count) => count + 1);
			try {
				const results = await Promise.all(
					ports.map((port) => killPortTarget(port, localKill)),
				);
				const failed = results.filter((result) => !result.success);
				if (failed.length === 1) {
					toast.error("Failed to close 1 port", {
						description: getFailureDescription(failed[0] ?? { success: false }),
					});
				} else if (failed.length > 1) {
					toast.error(`Failed to close ${failed.length} ports`, {
						description: getFailureDescription(failed[0] ?? { success: false }),
					});
				}
				return results;
			} finally {
				await refreshPorts();
				setPendingCount((count) => Math.max(0, count - 1));
			}
		},
		[localKill, refreshPorts],
	);

	return {
		killPort,
		killPorts,
		isPending: pendingCount > 0 || externalPending,
	};
}
