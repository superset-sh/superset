import type { DashboardSidebarGithubStatus } from "../../types";

export interface GithubStatusEntry {
	machineId: string;
	/** Undefined from a host older than the field; null when the sweep is healthy. */
	status: DashboardSidebarGithubStatus | null | undefined;
}

/**
 * One notice for the sidebar. The hold is per host, so the local machine's
 * wins (it is the one the user can fix), else the first remote host's.
 */
export function pickGithubStatus(
	entries: GithubStatusEntry[],
	localMachineId: string | null,
): DashboardSidebarGithubStatus | null {
	const local = entries.find(
		(entry) => entry.machineId === localMachineId && entry.status,
	);
	if (local?.status) return local.status;
	return entries.find((entry) => entry.status)?.status ?? null;
}
