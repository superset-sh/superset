import type { TabValue } from "../../components/TasksTopBar";

export function matchesTaskStatusFilter(
	statusType: string,
	filter: TabValue,
): boolean {
	if (filter === "all") return true;
	if (filter === "active") {
		return statusType === "started" || statusType === "unstarted";
	}
	return statusType === filter;
}
