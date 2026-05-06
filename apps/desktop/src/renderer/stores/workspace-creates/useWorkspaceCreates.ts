import type { WorkspaceState } from "@superset/panes";
import { useCallback } from "react";
import { resolveHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { authClient } from "renderer/lib/auth-client";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import type { PaneViewerData } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import {
	getPrependTabOrder,
	isSidebarWorkspaceVisible,
} from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { appendLaunchesToPaneLayout } from "./appendLaunchesToPaneLayout";
import {
	type InFlightEntry,
	useWorkspaceCreatesStore,
	type WorkspacesCreateInput,
} from "./store";

export interface SubmitArgs {
	hostId: string;
	snapshot: WorkspacesCreateInput;
}

export type SubmitResult =
	| { ok: true; workspaceId: string; alreadyExists: boolean }
	| { ok: false; error: string };

export interface UseWorkspaceCreatesApi {
	entries: InFlightEntry[];
	submit: (args: SubmitArgs) => Promise<SubmitResult>;
	retry: (workspaceId: string) => Promise<void>;
	dismiss: (workspaceId: string) => void;
}

export function useWorkspaceCreates(): UseWorkspaceCreatesApi {
	const entries = useWorkspaceCreatesStore((s) => s.entries);
	const { machineId, activeHostUrl } = useLocalHostService();
	const { data: session } = authClient.useSession();
	const organizationId = session?.session?.activeOrganizationId;
	const collections = useCollections();

	const dispatch = useCallback(
		async (args: SubmitArgs): Promise<SubmitResult> => {
			const workspaceId = args.snapshot.id;
			if (!workspaceId) {
				throw new Error(
					"workspaces.create requires `id` for in-flight tracking",
				);
			}
			if (!organizationId) {
				const error = "No active organization";
				useWorkspaceCreatesStore.getState().markError(workspaceId, error);
				return { ok: false, error };
			}
			const hostUrl = resolveHostUrl({
				hostId: args.hostId,
				machineId,
				activeHostUrl,
				organizationId,
			});
			if (!hostUrl) {
				const error = "Host service not available";
				useWorkspaceCreatesStore.getState().markError(workspaceId, error);
				return { ok: false, error };
			}
			try {
				const client = getHostServiceClientByUrl(hostUrl);
				const result = await client.workspaces.create.mutate(args.snapshot);

				const existing = collections.v2WorkspaceLocalState.get(
					result.workspace.id,
				);
				const paneLayout = appendLaunchesToPaneLayout({
					existing: existing?.paneLayout as
						| WorkspaceState<PaneViewerData>
						| undefined,
					terminals: result.terminals,
					agents: result.agents,
				});
				if (existing) {
					collections.v2WorkspaceLocalState.update(
						result.workspace.id,
						(draft) => {
							draft.paneLayout = paneLayout;
						},
					);
				} else {
					const projectId = result.workspace.projectId;
					const topLevelItems = [
						...Array.from(collections.v2WorkspaceLocalState.state.values())
							.filter(
								(item) =>
									item.sidebarState.projectId === projectId &&
									item.sidebarState.sectionId === null &&
									isSidebarWorkspaceVisible(item),
							)
							.map((item) => ({ tabOrder: item.sidebarState.tabOrder })),
						...Array.from(collections.v2SidebarSections.state.values())
							.filter((item) => item.projectId === projectId)
							.map((item) => ({ tabOrder: item.tabOrder })),
					];
					collections.v2WorkspaceLocalState.insert({
						workspaceId: result.workspace.id,
						createdAt: new Date(),
						sidebarState: {
							projectId,
							tabOrder: getPrependTabOrder(topLevelItems),
							sectionId: null,
							changesFilter: { kind: "all" },
							activeTab: "changes",
							isHidden: false,
						},
						paneLayout,
						viewedFiles: [],
						recentlyViewedFiles: [],
					});
				}
				// On alreadyExists the server returns the canonical workspace id,
				// which can differ from our optimistic snapshot id. The in-flight
				// entry is still keyed by snapshot id and won't ever resolve, so
				// drop it — the canonical workspace now lives in collections and
				// callers redirect there.
				if (result.alreadyExists && result.workspace.id !== workspaceId) {
					useWorkspaceCreatesStore.getState().remove(workspaceId);
				}
				return {
					ok: true,
					workspaceId: result.workspace.id,
					alreadyExists: result.alreadyExists,
				};
			} catch (err) {
				const error = err instanceof Error ? err.message : String(err);
				useWorkspaceCreatesStore.getState().markError(workspaceId, error);
				return { ok: false, error };
			}
		},
		[machineId, activeHostUrl, organizationId, collections],
	);

	const submit = useCallback(
		async (args: SubmitArgs): Promise<SubmitResult> => {
			const workspaceId = args.snapshot.id;
			if (!workspaceId) {
				throw new Error(
					"workspaces.create requires `id` for in-flight tracking",
				);
			}
			useWorkspaceCreatesStore.getState().add({
				hostId: args.hostId,
				snapshot: args.snapshot,
				state: "creating",
			});
			return await dispatch(args);
		},
		[dispatch],
	);

	const retry = useCallback(
		async (workspaceId: string) => {
			const entry = useWorkspaceCreatesStore
				.getState()
				.entries.find((e) => e.snapshot.id === workspaceId);
			if (!entry) return;
			useWorkspaceCreatesStore.getState().markCreating(workspaceId);
			await dispatch({ hostId: entry.hostId, snapshot: entry.snapshot });
		},
		[dispatch],
	);

	const dismiss = useCallback((workspaceId: string) => {
		useWorkspaceCreatesStore.getState().remove(workspaceId);
	}, []);

	return { entries, submit, retry, dismiss };
}
