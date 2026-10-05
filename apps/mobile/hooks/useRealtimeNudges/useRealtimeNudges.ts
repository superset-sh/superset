import type {
	RealtimeNudgeKind,
	RealtimeUpdate,
} from "@superset/shared/realtime";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useSession } from "@/lib/auth/client";
import { openNudgeSocket } from "@/lib/realtime";
import type { CloudWorkspaceRow } from "../useCloudWorkspaces";
import { patchCloudWorkspaceRows } from "./patchCloudWorkspaceRows";

const ALL_KINDS: readonly RealtimeNudgeKind[] = ["hosts", "cloud_workspaces"];

function invalidate(
	queryClient: QueryClient,
	organizationId: string,
	kinds: readonly RealtimeNudgeKind[],
) {
	for (const kind of kinds) {
		switch (kind) {
			case "hosts":
				void queryClient.invalidateQueries({
					queryKey: ["cloud", "host", "roster", organizationId],
				});
				break;
			case "cloud_workspaces":
				void queryClient.invalidateQueries({
					queryKey: ["cloud", "cloudWorkspace"],
				});
				break;
		}
	}
}

function patch(
	queryClient: QueryClient,
	organizationId: string,
	updates: readonly RealtimeUpdate[],
) {
	if (updates.length === 0) return;
	queryClient.setQueriesData<CloudWorkspaceRow[]>(
		{ queryKey: ["cloud", "cloudWorkspace", "list", organizationId] },
		(rows) => rows && patchCloudWorkspaceRows(rows, updates),
	);
}

/**
 * One socket to the realtime Worker while signed in. The API sends a nudge
 * after it writes hosts or cloud workspaces: a kind refetches, a patch edits
 * the cached rows in place.
 */
export function useRealtimeNudges(): void {
	const { data: session } = useSession();
	const organizationId = session?.session?.activeOrganizationId ?? null;
	const queryClient = useQueryClient();

	useEffect(() => {
		if (!organizationId) return;
		return openNudgeSocket({
			organizationId,
			onMessage: (message) => {
				patch(queryClient, organizationId, message.updates);
				invalidate(queryClient, organizationId, message.kinds);
			},
			onReopen: () => invalidate(queryClient, organizationId, ALL_KINDS),
		});
	}, [organizationId, queryClient]);
}
