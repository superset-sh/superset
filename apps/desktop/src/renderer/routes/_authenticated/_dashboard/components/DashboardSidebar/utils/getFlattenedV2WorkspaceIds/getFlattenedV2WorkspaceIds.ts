import type { AppCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";
import { getVisibleSidebarWorkspaces } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";

type TopLevelItem =
	| { kind: "workspace"; tabOrder: number; workspaceId: string }
	| { kind: "section"; tabOrder: number; sectionId: string };

export interface FlattenedSectionInput {
	id: string;
	projectId: string;
	tabOrder: number;
}

export interface FlattenedWorkspaceInput {
	id: string;
	sectionId?: string | null;
	tabOrder?: number;
}

/**
 * Sidebar-visual order of workspace ids across all projects. Membership and
 * visibility come from local state (`v2SidebarProjects`,
 * `v2WorkspaceLocalState`); grouping and placement come from host-owned
 * workspace/section rows, which callers pass in from `useHostWorkspaces`.
 */
export function getFlattenedV2WorkspaceIds(
	collections: Pick<
		AppCollections,
		"v2SidebarProjects" | "v2WorkspaceLocalState"
	>,
	hostData: {
		workspaces: FlattenedWorkspaceInput[];
		sections: FlattenedSectionInput[];
	},
): string[] {
	const projects = Array.from(
		collections.v2SidebarProjects.state.values(),
	).sort((left, right) => left.tabOrder - right.tabOrder);
	const allLocalRows = Array.from(
		collections.v2WorkspaceLocalState.state.values(),
	);
	const visibleLocalRows = getVisibleSidebarWorkspaces(allLocalRows);
	const hostWorkspacesById = new Map(
		hostData.workspaces.map((workspace) => [workspace.id, workspace]),
	);

	const result: string[] = [];

	for (const project of projects) {
		const projectWorkspaces = visibleLocalRows
			.filter(
				(localRow) => localRow.sidebarState.projectId === project.projectId,
			)
			.flatMap((localRow) => {
				const workspace = hostWorkspacesById.get(localRow.workspaceId);
				if (!workspace) return [];
				return [
					{
						workspaceId: localRow.workspaceId,
						sectionId: workspace.sectionId ?? null,
						tabOrder: workspace.tabOrder ?? 0,
					},
				];
			});
		const projectSections = hostData.sections.filter(
			(section) => section.projectId === project.projectId,
		);

		const topLevelItems: TopLevelItem[] = [];
		for (const workspace of projectWorkspaces) {
			if (workspace.sectionId == null) {
				topLevelItems.push({
					kind: "workspace",
					tabOrder: workspace.tabOrder,
					workspaceId: workspace.workspaceId,
				});
			}
		}
		for (const section of projectSections) {
			topLevelItems.push({
				kind: "section",
				tabOrder: section.tabOrder,
				sectionId: section.id,
			});
		}
		topLevelItems.sort((left, right) => {
			if (left.tabOrder !== right.tabOrder) {
				return left.tabOrder - right.tabOrder;
			}
			if (left.kind === right.kind) return 0;
			return left.kind === "section" ? -1 : 1;
		});

		for (const item of topLevelItems) {
			if (item.kind === "workspace") {
				result.push(item.workspaceId);
				continue;
			}
			const sectionWorkspaces = projectWorkspaces
				.filter((workspace) => workspace.sectionId === item.sectionId)
				.sort((left, right) => left.tabOrder - right.tabOrder);
			for (const workspace of sectionWorkspaces) {
				result.push(workspace.workspaceId);
			}
		}
	}

	return result;
}
