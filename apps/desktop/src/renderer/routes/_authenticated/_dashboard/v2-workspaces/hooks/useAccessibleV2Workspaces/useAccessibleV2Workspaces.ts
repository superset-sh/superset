import { and, eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";
import { env } from "renderer/env.renderer";
import { authClient } from "renderer/lib/auth-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { isSidebarWorkspaceVisible } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { MOCK_ORG_ID } from "shared/constants";

export type V2WorkspaceHostType = "local-device" | "remote-device" | "cloud";

export interface AccessibleV2Workspace {
	id: string;
	name: string;
	branch: string;
	type: "main" | "worktree";
	createdAt: Date;
	createdByUserId: string | null;
	createdByName: string | null;
	createdByImage: string | null;
	isCreatedByCurrentUser: boolean;
	projectId: string;
	projectName: string;
	hostId: string;
	hostName: string;
	hostMachineId: string | null;
	hostIsOnline: boolean;
	hostType: V2WorkspaceHostType;
	isInSidebar: boolean;
}

export interface V2WorkspaceProjectGroup {
	projectId: string;
	projectName: string;
	workspaces: AccessibleV2Workspace[];
}

export interface V2WorkspaceDeviceCounts {
	all: number;
	thisDevice: number;
	otherDevices: number;
	cloud: number;
}

export interface UseAccessibleV2WorkspacesResult {
	all: AccessibleV2Workspace[];
	pinned: AccessibleV2Workspace[];
	others: AccessibleV2Workspace[];
	counts: V2WorkspaceDeviceCounts;
}

interface UseAccessibleV2WorkspacesOptions {
	searchQuery?: string;
}

function workspaceMatchesSearch(
	workspace: AccessibleV2Workspace,
	searchQuery: string,
): boolean {
	if (!searchQuery.trim()) return true;
	const query = searchQuery.trim().toLowerCase();
	return (
		workspace.name.toLowerCase().includes(query) ||
		workspace.projectName.toLowerCase().includes(query) ||
		workspace.branch.toLowerCase().includes(query) ||
		workspace.hostName.toLowerCase().includes(query) ||
		(workspace.createdByName ?? "").toLowerCase().includes(query)
	);
}

export function useAccessibleV2Workspaces(
	options: UseAccessibleV2WorkspacesOptions = {},
): UseAccessibleV2WorkspacesResult {
	const searchQuery = options.searchQuery ?? "";
	const { data: session } = authClient.useSession();
	const collections = useCollections();
	const { machineId } = useLocalHostService();

	const activeOrganizationId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: (session?.session?.activeOrganizationId ?? null);
	const currentUserId = session?.user?.id ?? null;

	const { data: rows = [] } = useLiveQuery(
		(q) =>
			q
				.from({ workspaces: collections.v2Workspaces })
				.innerJoin({ hosts: collections.v2Hosts }, ({ workspaces, hosts }) =>
					eq(workspaces.hostId, hosts.machineId),
				)
				.innerJoin(
					{ userHosts: collections.v2UsersHosts },
					({ hosts, userHosts }) => eq(userHosts.hostId, hosts.machineId),
				)
				.innerJoin(
					{ projects: collections.v2Projects },
					({ workspaces, projects }) => eq(workspaces.projectId, projects.id),
				)
				.leftJoin(
					{ sidebarState: collections.v2WorkspaceLocalState },
					({ workspaces, sidebarState }) =>
						eq(sidebarState.workspaceId, workspaces.id),
				)
				.leftJoin(
					{ sidebarProject: collections.v2SidebarProjects },
					({ projects, sidebarProject }) =>
						eq(sidebarProject.projectId, projects.id),
				)
				.leftJoin({ creators: collections.users }, ({ workspaces, creators }) =>
					eq(workspaces.createdByUserId, creators.id),
				)
				.where(({ workspaces, userHosts }) =>
					and(
						eq(workspaces.organizationId, activeOrganizationId ?? ""),
						eq(userHosts.userId, currentUserId ?? ""),
					),
				)
				.select(
					({
						workspaces,
						hosts,
						projects,
						sidebarState,
						sidebarProject,
						creators,
					}) => ({
						id: workspaces.id,
						name: workspaces.name,
						branch: workspaces.branch,
						type: workspaces.type,
						createdAt: workspaces.createdAt,
						createdByUserId: workspaces.createdByUserId,
						createdByName: creators?.name ?? null,
						createdByImage: creators?.image ?? null,
						projectId: projects.id,
						projectName: projects.name,
						hostId: hosts.machineId,
						hostName: hosts.name,
						hostMachineId: hosts.machineId,
						hostIsOnline: hosts.isOnline,
						sidebarProjectId: sidebarProject?.projectId ?? null,
						sidebarWorkspaceId: sidebarState?.workspaceId ?? null,
						sidebarIsHidden: sidebarState?.sidebarState.isHidden ?? false,
					}),
				),
		[activeOrganizationId, collections, currentUserId],
	);

	const enriched = useMemo<AccessibleV2Workspace[]>(() => {
		const deduped = new Map<string, AccessibleV2Workspace>();
		for (const row of rows) {
			if (deduped.has(row.id)) continue;
			const hostType: V2WorkspaceHostType =
				row.hostMachineId == null
					? "cloud"
					: row.hostMachineId === machineId
						? "local-device"
						: "remote-device";
			const isAutoVisibleMain =
				row.type === "main" &&
				row.hostMachineId != null &&
				row.hostMachineId === machineId &&
				row.sidebarProjectId != null;
			const isInSidebar =
				isSidebarWorkspaceVisible({ isHidden: row.sidebarIsHidden }) &&
				(row.sidebarWorkspaceId != null || isAutoVisibleMain);

			deduped.set(row.id, {
				id: row.id,
				name: row.name,
				branch: row.branch,
				type: row.type,
				createdAt: new Date(row.createdAt),
				createdByUserId: row.createdByUserId,
				createdByName: row.createdByName ?? null,
				createdByImage: row.createdByImage ?? null,
				isCreatedByCurrentUser:
					currentUserId != null && row.createdByUserId === currentUserId,
				projectId: row.projectId,
				projectName: row.projectName,
				hostId: row.hostId,
				hostName: row.hostName,
				hostMachineId: row.hostMachineId,
				hostIsOnline: row.hostIsOnline,
				hostType,
				isInSidebar,
			});
		}
		return Array.from(deduped.values()).sort(
			(a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
		);
	}, [rows, machineId, currentUserId]);

	const searchFiltered = useMemo(
		() =>
			enriched.filter((workspace) =>
				workspaceMatchesSearch(workspace, searchQuery),
			),
		[enriched, searchQuery],
	);

	const pinned = useMemo(
		() => searchFiltered.filter((workspace) => workspace.isInSidebar),
		[searchFiltered],
	);

	const others = useMemo(
		() => searchFiltered.filter((workspace) => !workspace.isInSidebar),
		[searchFiltered],
	);

	const counts = useMemo<V2WorkspaceDeviceCounts>(() => {
		let thisDevice = 0;
		let otherDevices = 0;
		let cloud = 0;
		for (const workspace of searchFiltered) {
			if (workspace.hostType === "local-device") thisDevice += 1;
			else if (workspace.hostType === "remote-device") otherDevices += 1;
			else cloud += 1;
		}
		return {
			all: searchFiltered.length,
			thisDevice,
			otherDevices,
			cloud,
		};
	}, [searchFiltered]);

	return {
		all: searchFiltered,
		pinned,
		others,
		counts,
	};
}
