import type { HostProjectItem } from "@/hooks/useHostProjects";
import type { HostWorkspaceItem } from "@/hooks/useHostWorkspaces";

export const NO_PROJECT_SECTION_ID = "__none";

export interface ProjectSection {
	projectId: string;
	name: string;
	iconUrl: string | null;
	workspaces: HostWorkspaceItem[];
}

/**
 * Hosts that set up the same project share its id, so a project on several
 * machines is one section.
 */
export function buildProjectSections({
	workspaces,
	projectsByHost,
	noProjectName,
	compareWorkspaces,
	activityTs,
}: {
	workspaces: HostWorkspaceItem[];
	projectsByHost: Readonly<Record<string, HostProjectItem[]>>;
	noProjectName: string;
	compareWorkspaces: (a: HostWorkspaceItem, b: HostWorkspaceItem) => number;
	activityTs: (workspace: HostWorkspaceItem) => number;
}): ProjectSection[] {
	// A project id the workspace's own host no longer reports is as good as
	// none, even when another host still reports it: a section's "+" starts
	// work on one of its workspaces' hosts. Also covers the beat where
	// workspaces have loaded and projects haven't.
	const knownProjectKeys = new Set(
		Object.entries(projectsByHost).flatMap(([machineId, projects]) =>
			projects.map((project) => `${machineId}:${project.id}`),
		),
	);
	const byProject = new Map<string, HostWorkspaceItem[]>();
	for (const workspace of workspaces) {
		const projectId =
			workspace.projectId &&
			knownProjectKeys.has(`${workspace.hostId}:${workspace.projectId}`)
				? workspace.projectId
				: NO_PROJECT_SECTION_ID;
		const group = byProject.get(projectId);
		if (group) group.push(workspace);
		else byProject.set(projectId, [workspace]);
	}

	const uniqueProjects = new Map<string, HostProjectItem>();
	for (const project of Object.values(projectsByHost).flat()) {
		if (!uniqueProjects.has(project.id))
			uniqueProjects.set(project.id, project);
	}
	return (
		[
			...[...uniqueProjects.values()].map((project) => ({
				projectId: project.id,
				name: project.name,
				iconUrl: project.iconUrl,
			})),
			{
				projectId: NO_PROJECT_SECTION_ID,
				name: noProjectName,
				iconUrl: null,
			},
		]
			.map((section) => ({
				...section,
				workspaces: (byProject.get(section.projectId) ?? []).sort(
					compareWorkspaces,
				),
			}))
			// An empty section is a row that says nothing and does nothing — the
			// composer's project picker is where you start work in a project that
			// has none yet.
			.filter((section) => section.workspaces.length > 0)
			.sort((a, b) => {
				// Sections rank by their liveliest workspace, so the project you
				// were last in leads; ties fall back to the name.
				const aTs = newestActivity(a.workspaces, activityTs);
				const bTs = newestActivity(b.workspaces, activityTs);
				if (aTs !== bTs) return bTs - aTs;
				return a.name.localeCompare(b.name);
			})
	);
}

/** Not the first row's: pins can put an older workspace first. */
function newestActivity(
	workspaces: HostWorkspaceItem[],
	activityTs: (workspace: HostWorkspaceItem) => number,
): number {
	return workspaces.reduce(
		(newest, workspace) => Math.max(newest, activityTs(workspace)),
		0,
	);
}
