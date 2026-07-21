import { table } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { executeSidebarCommand, getLocalResourceClient } from "../shared";

interface SidebarListRow {
	project: string;
	group: string;
	state: string;
	workspaces: string;
	id: string;
}

interface SidebarListData {
	groups: Array<{
		id: string;
		projectId: string;
		projectName: string;
		name: string;
		isCollapsed: boolean;
		workspaces: Array<{ id: string; name: string }>;
	}>;
	ungrouped: Array<{
		projectId: string;
		projectName: string;
		workspaces: Array<{ id: string; name: string }>;
	}>;
	rows: SidebarListRow[];
}

export default command({
	description: "List local sidebar groups and workspace placement",
	display: (data) =>
		table(
			(data as SidebarListData).rows as unknown as Record<string, unknown>[],
			["project", "group", "state", "workspaces", "id"],
			["PROJECT", "GROUP", "STATE", "WORKSPACES", "ID"],
			[24, 24, 10, 42, 36],
		),
	run: async ({ ctx }) => {
		const client = getLocalResourceClient(ctx);
		const [state, projects, workspaces] = await Promise.all([
			executeSidebarCommand(ctx, { action: "list" }),
			client.project.list.query(),
			client.workspace.list.query(),
		]);
		const projectNameById = new Map(
			projects.map((project) => [project.id, project.name]),
		);
		const workspaceNameById = new Map(
			workspaces.map((workspace) => [workspace.id, workspace.name]),
		);
		const groups = state.groups.map((group) => ({
			...group,
			projectName: projectNameById.get(group.projectId) ?? group.projectId,
			workspaces: state.workspaces
				.filter((workspace) => workspace.groupId === group.id)
				.map((workspace) => ({
					id: workspace.id,
					name: workspaceNameById.get(workspace.id) ?? workspace.id,
				})),
		}));
		const ungroupedByProject = new Map<
			string,
			Array<{ id: string; name: string }>
		>();
		for (const workspace of state.workspaces) {
			if (workspace.groupId !== null) continue;
			const entries = ungroupedByProject.get(workspace.projectId) ?? [];
			entries.push({
				id: workspace.id,
				name: workspaceNameById.get(workspace.id) ?? workspace.id,
			});
			ungroupedByProject.set(workspace.projectId, entries);
		}
		const ungrouped = Array.from(
			ungroupedByProject,
			([projectId, entries]) => ({
				projectId,
				projectName: projectNameById.get(projectId) ?? projectId,
				workspaces: entries,
			}),
		);
		const rows: SidebarListRow[] = [
			...groups.map((group) => ({
				project: group.projectName,
				group: group.name,
				state: group.isCollapsed ? "collapsed" : "expanded",
				workspaces: group.workspaces
					.map((workspace) => workspace.name)
					.join(", "),
				id: group.id,
			})),
			...ungrouped.map((entry) => ({
				project: entry.projectName,
				group: "(ungrouped)",
				state: "-",
				workspaces: entry.workspaces
					.map((workspace) => workspace.name)
					.join(", "),
				id: "-",
			})),
		];
		return {
			data: { groups, ungrouped, rows } satisfies SidebarListData,
		};
	},
});
