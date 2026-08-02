import { createContext, type ReactNode, useContext, useMemo } from "react";
import type { DashboardSidebarWorkspace } from "../../../../types";

interface WorkspaceBulkMenuScopeValue {
	projectId: string;
	workspacesById: ReadonlyMap<string, DashboardSidebarWorkspace>;
	sectionIdByWorkspaceId: ReadonlyMap<string, string>;
}

const WorkspaceBulkMenuScopeContext =
	createContext<WorkspaceBulkMenuScopeValue | null>(null);

/**
 * Scopes the bulk context menu to one project's rows. Rows rendered outside
 * this provider (pinned section, collapsed rail) always get the single menu.
 */
export function WorkspaceBulkMenuScope({
	projectId,
	workspacesById,
	groupInfo,
	children,
}: {
	projectId: string;
	workspacesById: ReadonlyMap<string, DashboardSidebarWorkspace>;
	groupInfo: ReadonlyMap<string, { sectionId: string }>;
	children: ReactNode;
}) {
	const value = useMemo(
		() => ({
			projectId,
			workspacesById,
			sectionIdByWorkspaceId: new Map(
				[...groupInfo].map(([workspaceId, group]) => [
					workspaceId,
					group.sectionId,
				]),
			),
		}),
		[projectId, workspacesById, groupInfo],
	);
	return (
		<WorkspaceBulkMenuScopeContext.Provider value={value}>
			{children}
		</WorkspaceBulkMenuScopeContext.Provider>
	);
}

export function useWorkspaceBulkMenuScope(): WorkspaceBulkMenuScopeValue | null {
	return useContext(WorkspaceBulkMenuScopeContext);
}
