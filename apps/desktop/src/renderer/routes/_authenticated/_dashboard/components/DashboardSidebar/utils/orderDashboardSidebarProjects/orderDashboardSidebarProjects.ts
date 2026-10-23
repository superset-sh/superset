import type { SidebarProjectOrder } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";
import type { DashboardSidebarProject } from "../../types";
import { sameItems } from "../sameItems";

export function createProjectNameCollator(locale: string): Intl.Collator {
	return new Intl.Collator(locale, { sensitivity: "base", numeric: true });
}

/**
 * Orders the project list by name, ignoring case and reading digits as
 * numbers. Manual returns the input untouched, and a list already in order
 * keeps its identity so memoized rows are not disturbed.
 */
export function orderDashboardSidebarProjects(
	projects: DashboardSidebarProject[],
	order: SidebarProjectOrder,
	collator: Intl.Collator,
): DashboardSidebarProject[] {
	if (order === "manual") return projects;

	const direction = order === "nameAsc" ? 1 : -1;
	const sorted = [...projects].sort(
		(left, right) =>
			direction * collator.compare(left.name ?? "", right.name ?? "") ||
			left.id.localeCompare(right.id),
	);
	return sameItems(sorted, projects) ? projects : sorted;
}
