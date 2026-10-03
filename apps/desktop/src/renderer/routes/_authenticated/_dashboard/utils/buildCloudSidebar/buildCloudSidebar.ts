import { sortByLastAgentMessage } from "@superset/shared/cloud-workspace-groups";
import type { CloudWorkspaceRow } from "renderer/hooks/useCloudWorkspaces";
import type {
	CloudSidebarEntry,
	CloudSidebarGroup,
	CloudSidebarOrgState,
} from "renderer/routes/_authenticated/_dashboard/stores/cloudSidebarStore";

type SidebarWorkspace = Pick<
	CloudWorkspaceRow,
	"id" | "createdAt" | "createdBy" | "agentStatusAt"
>;

export function isInCloudSidebar(
	workspace: Pick<CloudWorkspaceRow, "createdBy">,
	entry: CloudSidebarEntry | undefined,
	userId: string | null,
): boolean {
	return (
		(userId !== null && workspace.createdBy?.userId === userId) ||
		entry?.inSidebar === true
	);
}

export interface CloudSidebarLayout<Workspace extends SidebarWorkspace> {
	ungrouped: Workspace[];
	groups: Array<{ group: CloudSidebarGroup; workspaces: Workspace[] }>;
}

export function buildCloudSidebar<Workspace extends SidebarWorkspace>({
	workspaces,
	state,
	userId,
}: {
	workspaces: Workspace[];
	state: CloudSidebarOrgState;
	userId: string | null;
}): CloudSidebarLayout<Workspace> {
	const groupIds = new Set(state.groups.map((group) => group.id));
	const byGroup = new Map<string, Workspace[]>();
	const ungrouped: Workspace[] = [];

	const shown = sortByLastAgentMessage(
		workspaces.filter((workspace) =>
			isInCloudSidebar(workspace, state.entries[workspace.id], userId),
		),
	);

	for (const workspace of shown) {
		const groupId = state.entries[workspace.id]?.groupId;
		if (groupId && groupIds.has(groupId)) {
			byGroup.set(groupId, [...(byGroup.get(groupId) ?? []), workspace]);
		} else {
			ungrouped.push(workspace);
		}
	}

	return {
		ungrouped,
		groups: [...state.groups]
			.sort((left, right) => left.createdAt - right.createdAt)
			.map((group) => ({ group, workspaces: byGroup.get(group.id) ?? [] })),
	};
}

export function isCloudWorkspaceRead(
	workspace: Pick<CloudWorkspaceRow, "agentStatusAt">,
	lastReadAt: number | undefined,
): boolean {
	return (
		workspace.agentStatusAt === null ||
		(lastReadAt ?? 0) >= workspace.agentStatusAt.getTime()
	);
}
