import type { ProjectCollectionRootItem } from "renderer/routes/_authenticated/utils/projectCollections/projectCollections";
import type { DashboardSidebarProject } from "../../types";
import { filterDashboardSidebarProjects } from "../filterDashboardSidebarProjects";

export function buildSidebarCollectionView(
	projects: DashboardSidebarProject[],
	items: ProjectCollectionRootItem<{ id: string }>[],
	filter: string,
) {
	const byId = new Map(projects.map((project) => [project.id, project]));
	const rootItems: ProjectCollectionRootItem<DashboardSidebarProject>[] = [];
	const included = new Set<string>();
	for (const item of items) {
		if (item.type === "project") {
			included.add(item.project.id);
			const project = byId.get(item.project.id);
			if (project) {
				const match = filterDashboardSidebarProjects([project], filter)[0];
				if (match) rootItems.push({ ...item, project: match });
			}
			continue;
		}
		const members = item.collection.projects.flatMap((member) => {
			included.add(member.id);
			const project = byId.get(member.id);
			return project ? [project] : [];
		});
		const nameMatches =
			filter.trim() !== "" &&
			item.collection.name.toLowerCase().includes(filter.trim().toLowerCase());
		const matches = filterDashboardSidebarProjects(
			members,
			nameMatches ? "" : filter,
		);
		if (filter.trim() && !nameMatches && matches.length === 0) continue;
		rootItems.push({
			...item,
			collection: {
				...item.collection,
				projects: nameMatches
					? matches.map((project) => ({ ...project, isCollapsed: false }))
					: matches,
				isCollapsed: filter.trim() ? false : item.collection.isCollapsed,
			},
		});
	}
	for (const project of filterDashboardSidebarProjects(
		projects.filter((project) => !included.has(project.id)),
		filter,
	)) {
		rootItems.push({ type: "project", project, tabOrder: rootItems.length });
	}
	return {
		rootItems,
		projects: rootItems.flatMap((item) =>
			item.type === "project" ? [item.project] : item.collection.projects,
		),
		visibleProjects: rootItems.flatMap((item) =>
			item.type === "project"
				? [item.project]
				: item.collection.isCollapsed
					? []
					: item.collection.projects,
		),
	};
}
