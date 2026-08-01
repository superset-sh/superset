import type {
	DashboardSidebarProject,
	DashboardSidebarProjectChild,
} from "../../types";

function matches(text: string, normalizedQuery: string): boolean {
	return text.toLowerCase().includes(normalizedQuery);
}

// Reuse the input objects whenever nothing about them changes — the sidebar's
// memoized rows rely on referential stability, and the filter reruns on every
// keystroke.
function expandProject(
	project: DashboardSidebarProject,
): DashboardSidebarProject {
	return project.isCollapsed ? { ...project, isCollapsed: false } : project;
}

function expandSection(
	child: Extract<DashboardSidebarProjectChild, { type: "section" }>,
): DashboardSidebarProjectChild {
	return child.section.isCollapsed
		? { type: "section", section: { ...child.section, isCollapsed: false } }
		: child;
}

function filterChildren(
	children: DashboardSidebarProjectChild[],
	normalizedQuery: string,
): DashboardSidebarProjectChild[] {
	return children.flatMap((child): DashboardSidebarProjectChild[] => {
		if (child.type === "workspace") {
			return matches(child.workspace.name, normalizedQuery) ? [child] : [];
		}
		if (matches(child.section.name, normalizedQuery)) {
			return [expandSection(child)];
		}
		const workspaces = child.section.workspaces.filter((workspace) =>
			matches(workspace.name, normalizedQuery),
		);
		if (workspaces.length === 0) return [];
		if (workspaces.length === child.section.workspaces.length) {
			return [expandSection(child)];
		}
		return [
			{
				type: "section",
				section: { ...child.section, isCollapsed: false, workspaces },
			},
		];
	});
}

/**
 * Case-insensitive substring filter over projects. A project survives when its
 * name matches (kept whole) or when any of its workspaces/sections match
 * (pruned to the matches). Surviving projects and matched sections come back
 * expanded so the matches are actually visible; the persisted collapse state
 * is never written.
 */
export function filterDashboardSidebarProjects(
	projects: DashboardSidebarProject[],
	query: string,
): DashboardSidebarProject[] {
	const normalizedQuery = query.trim().toLowerCase();
	if (normalizedQuery === "") return projects;

	return projects.flatMap((project): DashboardSidebarProject[] => {
		if (matches(project.name, normalizedQuery)) {
			return [expandProject(project)];
		}
		const children = filterChildren(project.children, normalizedQuery);
		if (children.length === 0) return [];
		const childrenUnchanged =
			children.length === project.children.length &&
			children.every((child, index) => child === project.children[index]);
		if (childrenUnchanged) return [expandProject(project)];
		return [{ ...project, isCollapsed: false, children }];
	});
}
