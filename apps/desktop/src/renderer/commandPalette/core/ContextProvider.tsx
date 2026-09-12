import type { ExternalApp } from "@superset/local-db";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import {
	useLocation,
	useMatchRoute,
	useNavigate,
} from "@tanstack/react-router";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
} from "react";
import { useKnownHosts } from "renderer/hooks/known-hosts/useKnownHosts";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { useOpenNewWorkspace } from "renderer/hooks/useOpenNewWorkspace";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { isShelvedWorkspace } from "renderer/lib/workspaces/isShelvedWorkspace";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { getV2WorkspaceDisplayName } from "renderer/utils/getV2WorkspaceDisplayName";
import type { CommandContext } from "./types";

const Context = createContext<CommandContext | null>(null);

export function CommandContextProvider({ children }: { children: ReactNode }) {
	const location = useLocation();
	const matchRoute = useMatchRoute();
	const navigate = useNavigate();
	const collections = useCollections();
	const isV2CloudEnabled = useIsV2CloudEnabled();
	const openNewWorkspace = useOpenNewWorkspace();
	const {
		activeHostUrl,
		activeOrganizationId,
		activeOrganizationName,
		hostServiceStatus,
		machineId,
	} = useLocalHostService();

	const navigateTo = useCallback(
		(path: string) => {
			void navigate({ to: path });
		},
		[navigate],
	);

	const v2Match = matchRoute({ to: "/v2-workspace/$workspaceId", fuzzy: true });
	const v2WorkspaceId = v2Match !== false ? v2Match.workspaceId : null;

	const { workspaces: hostWorkspaces } = useHostWorkspaces();
	const { hosts } = useKnownHosts();
	const v2Workspace = useMemo(() => {
		if (!v2WorkspaceId) return null;
		const workspace = hostWorkspaces.find((w) => w.id === v2WorkspaceId);
		if (!workspace) return null;
		return {
			id: workspace.id,
			name: getV2WorkspaceDisplayName(workspace),
			projectId: workspace.projectId,
			type: workspace.type,
			hostId: workspace.hostId,
			isArchived: isShelvedWorkspace(workspace),
			hostIsOnline:
				workspace.hostId === machineId
					? null
					: (hosts.find((host) => host.machineId === workspace.hostId)
							?.isOnline ?? false),
		};
	}, [hostWorkspaces, hosts, machineId, v2WorkspaceId]);
	const projectId = v2Workspace?.projectId ?? null;

	const { data: preferredAppRows = [] } = useLiveQuery(
		(q) =>
			q
				.from({ sp: collections.v2SidebarProjects })
				.where(({ sp }) => eq(sp.projectId, projectId ?? ""))
				.select(({ sp }) => ({ defaultOpenInApp: sp.defaultOpenInApp })),
		[collections, projectId],
	);
	const preferredOpenInApp =
		(preferredAppRows[0]?.defaultOpenInApp as ExternalApp | null | undefined) ??
		undefined;

	const { data: placementRows = [] } = useLiveQuery(
		(q) =>
			q
				.from({ ls: collections.v2WorkspaceLocalState })
				.where(({ ls }) => eq(ls.workspaceId, v2WorkspaceId ?? ""))
				.select(({ ls }) => ({ workspaceId: ls.workspaceId })),
		[collections, v2WorkspaceId],
	);
	const hasSidebarPlacement = placementRows.length > 0;

	const { data: notificationSoundsMuted = false } =
		electronTrpc.settings.getNotificationSoundsMuted.useQuery();

	const context = useMemo<CommandContext>(
		() => ({
			route: { pathname: location.pathname, params: {} },
			workspace: v2Workspace
				? {
						id: v2Workspace.id,
						name: v2Workspace.name,
						projectId: v2Workspace.projectId ?? undefined,
						workspaceType: v2Workspace.type,
						hostId: v2Workspace.hostId ?? undefined,
						isArchived: v2Workspace.isArchived,
						hostIsOnline: v2Workspace.hostIsOnline,
						hasSidebarPlacement,
						preferredOpenInApp,
					}
				: null,
			activeHostUrl,
			activeOrganizationId,
			activeOrganizationName,
			hostServiceStatus,
			localMachineId: machineId ?? null,
			notificationSoundsMuted,
			isV2CloudEnabled,
			navigate: navigateTo,
			openNewWorkspace,
		}),
		[
			location.pathname,
			v2Workspace,
			hasSidebarPlacement,
			preferredOpenInApp,
			activeHostUrl,
			activeOrganizationId,
			activeOrganizationName,
			hostServiceStatus,
			machineId,
			notificationSoundsMuted,
			isV2CloudEnabled,
			navigateTo,
			openNewWorkspace,
		],
	);

	return <Context.Provider value={context}>{children}</Context.Provider>;
}

export function useCommandContext(): CommandContext {
	const ctx = useContext(Context);
	if (!ctx) {
		throw new Error(
			"useCommandContext must be used within CommandContextProvider",
		);
	}
	return ctx;
}
