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
import { useOpenNewWorkspace } from "renderer/hooks/useOpenNewWorkspace";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { getWorkspaceDisplayName } from "renderer/utils/getWorkspaceDisplayName";
import type { CommandContext } from "./types";

const Context = createContext<CommandContext | null>(null);

export function CommandContextProvider({ children }: { children: ReactNode }) {
	const location = useLocation();
	const matchRoute = useMatchRoute();
	const navigate = useNavigate();
	const collections = useCollections();
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

	const workspaceMatch = matchRoute({
		to: "/workspace/$workspaceId",
		fuzzy: true,
	});
	const routeWorkspaceId =
		workspaceMatch !== false ? workspaceMatch.workspaceId : null;

	const { workspaces: hostWorkspaces } = useHostWorkspaces();
	const hostWorkspace = useMemo(() => {
		if (!routeWorkspaceId) return null;
		const workspace = hostWorkspaces.find((w) => w.id === routeWorkspaceId);
		if (!workspace) return null;
		return {
			id: workspace.id,
			name: getWorkspaceDisplayName(workspace),
			projectId: workspace.projectId,
			type: workspace.type,
			hostId: workspace.hostId,
		};
	}, [hostWorkspaces, routeWorkspaceId]);
	const projectId = hostWorkspace?.projectId ?? null;

	const { data: preferredAppRows = [] } = useLiveQuery(
		(q) =>
			q
				.from({ sp: collections.sidebarProjects })
				.where(({ sp }) => eq(sp.projectId, projectId ?? ""))
				.select(({ sp }) => ({ defaultOpenInApp: sp.defaultOpenInApp })),
		[collections, projectId],
	);
	const preferredOpenInApp =
		(preferredAppRows[0]?.defaultOpenInApp as ExternalApp | null | undefined) ??
		undefined;

	const { data: notificationSoundsMuted = false } =
		electronTrpc.settings.getNotificationSoundsMuted.useQuery();

	const context = useMemo<CommandContext>(
		() => ({
			route: { pathname: location.pathname, params: {} },
			workspace: hostWorkspace
				? {
						id: hostWorkspace.id,
						name: hostWorkspace.name,
						projectId: hostWorkspace.projectId ?? undefined,
						workspaceType: hostWorkspace.type,
						hostId: hostWorkspace.hostId ?? undefined,
						preferredOpenInApp,
					}
				: null,
			activeHostUrl,
			activeOrganizationId,
			activeOrganizationName,
			hostServiceStatus,
			localMachineId: machineId ?? null,
			notificationSoundsMuted,
			navigate: navigateTo,
			openNewWorkspace,
		}),
		[
			location.pathname,
			hostWorkspace,
			preferredOpenInApp,
			activeHostUrl,
			activeOrganizationId,
			activeOrganizationName,
			hostServiceStatus,
			machineId,
			notificationSoundsMuted,
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
