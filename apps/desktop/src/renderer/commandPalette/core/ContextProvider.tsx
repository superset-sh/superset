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
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import type { CommandContext } from "./types";

const Context = createContext<CommandContext | null>(null);

export function CommandContextProvider({ children }: { children: ReactNode }) {
	const location = useLocation();
	const matchRoute = useMatchRoute();
	const navigate = useNavigate();
	const collections = useCollections();
	const { activeHostUrl, machineId } = useLocalHostService();

	const navigateTo = useCallback(
		(path: string) => {
			void navigate({ to: path });
		},
		[navigate],
	);

	const v2Match = matchRoute({ to: "/v2-workspace/$workspaceId", fuzzy: true });
	const v2WorkspaceId = v2Match !== false ? v2Match.workspaceId : null;

	const { data: v2WorkspaceRows = [] } = useLiveQuery(
		(q) =>
			q
				.from({ workspaces: collections.v2Workspaces })
				.where(({ workspaces }) => eq(workspaces.id, v2WorkspaceId ?? ""))
				.select(({ workspaces }) => ({
					id: workspaces.id,
					name: workspaces.name,
					projectId: workspaces.projectId,
					type: workspaces.type,
					hostId: workspaces.hostId,
				})),
		[collections, v2WorkspaceId],
	);
	const v2Workspace = v2WorkspaceId ? (v2WorkspaceRows[0] ?? null) : null;
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
						preferredOpenInApp,
					}
				: null,
			activeHostUrl,
			localMachineId: machineId ?? null,
			notificationSoundsMuted,
			navigate: navigateTo,
		}),
		[
			location.pathname,
			v2Workspace,
			preferredOpenInApp,
			activeHostUrl,
			machineId,
			notificationSoundsMuted,
			navigateTo,
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
