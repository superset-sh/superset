import type { SelectV2Workspace } from "@superset/db/schema";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

export type LocalHostStatus =
	| { status: "skip" }
	| { status: "loading" }
	| {
			status: "stopped";
			organizationId: string;
			lastError: string | null;
			lastAttemptAt: number | null;
			retryAttempt: number;
	  }
	| { status: "ready" };

/**
 * Mirror of `useRemoteHostStatus` for the **local** host. Returns the recovery
 * state the v2-workspace layout should render when the local host-service
 * is down — see superset-sh/superset#4299.
 *
 * - `skip` — workspace is not on this machine (remote host); caller falls
 *   through to `useRemoteHostStatus`.
 * - `loading` — provider hasn't decided yet (no machineId, or retry chain
 *   still in flight).
 * - `stopped` — host-service is unreachable AND the provider's automatic
 *   retry chain has exhausted. The recovery UI takes over here.
 * - `ready` — host-service is responding (`activeHostUrl` is non-null).
 */
export function useLocalHostStatus(
	workspace: SelectV2Workspace | null,
): LocalHostStatus {
	const {
		machineId,
		activeHostUrl,
		lastStartError,
		lastAttemptAt,
		retryAttempt,
		retryExhausted,
	} = useLocalHostService();

	if (!workspace) return { status: "loading" };
	const isLocal = machineId != null && workspace.hostId === machineId;
	if (!isLocal) return { status: "skip" };

	if (activeHostUrl) return { status: "ready" };

	// We're local, no connection, but the retry chain is still working through
	// its delays — render a blank loading state rather than the recovery UI.
	if (!retryExhausted) return { status: "loading" };

	return {
		status: "stopped",
		organizationId: workspace.organizationId,
		lastError: lastStartError,
		lastAttemptAt,
		retryAttempt,
	};
}
