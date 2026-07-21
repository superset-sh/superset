import type { SidebarCommand } from "@superset/host-service/events";
import { getEventBus } from "@superset/workspace-client";
import { useEffect, useEffectEvent } from "react";
import { getHostServiceWsToken } from "renderer/lib/host-service-auth";
import {
	createSidebarGroup,
	deleteSidebarGroup,
	ensureSidebarWorkspaceRecord,
	getSidebarStateSnapshot,
	moveSidebarWorkspaceToGroup,
	renameSidebarGroup,
	setSidebarGroupCollapsed,
} from "renderer/routes/_authenticated/hooks/useDashboardSidebarState/sidebarGroupMutations";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

export function SidebarCommandController(): null {
	const collections = useCollections();
	const { workspaces } = useHostWorkspaces();
	const { activeHostUrl, machineId } = useLocalHostService();

	const executeCommand = useEffectEvent((command: SidebarCommand) => {
		switch (command.action) {
			case "list":
				break;
			case "create-group":
				createSidebarGroup(collections, command);
				break;
			case "rename-group":
				renameSidebarGroup(collections, command.groupId, command.name);
				break;
			case "delete-group":
				deleteSidebarGroup(collections, command.groupId);
				break;
			case "move-workspace":
				{
					const workspace = workspaces.find(
						(item) => item.id === command.workspaceId,
					);
					if (!workspace) {
						throw new Error(`Workspace not found: ${command.workspaceId}`);
					}
					ensureSidebarWorkspaceRecord(
						collections,
						workspace.id,
						workspace.projectId,
					);
				}
				moveSidebarWorkspaceToGroup(
					collections,
					command.workspaceId,
					command.groupId,
				);
				break;
			case "set-group-collapsed":
				setSidebarGroupCollapsed(
					collections,
					command.groupId,
					command.collapsed,
				);
				break;
		}
		return getSidebarStateSnapshot(collections);
	});

	useEffect(() => {
		if (!activeHostUrl) return;
		const bus = getEventBus(activeHostUrl, () =>
			getHostServiceWsToken(activeHostUrl),
		);
		const removeListener = bus.on(
			"sidebar:command",
			"*",
			(commandId, payload) => {
				if (payload.targetMachineId !== machineId) return;
				try {
					bus.sendSidebarResult({
						commandId,
						ok: true,
						state: executeCommand(payload.command),
					});
				} catch (error) {
					bus.sendSidebarResult({
						commandId,
						ok: false,
						error:
							error instanceof Error ? error.message : "Sidebar command failed",
					});
				}
			},
		);
		const release = bus.retain();
		return () => {
			removeListener();
			release();
		};
	}, [activeHostUrl, machineId]);

	return null;
}
