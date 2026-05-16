import type { SelectV2Workspace } from "@superset/db/schema";
import type { AppRouter } from "@superset/host-service";
import type { WorkspaceState } from "@superset/panes";
import type { inferRouterInputs } from "@trpc/server";
import { useCallback } from "react";
import { resolveHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { useRelayUrl } from "renderer/hooks/useRelayUrl";
import { authClient } from "renderer/lib/auth-client";
import { getHostServiceUnavailableMessage } from "renderer/lib/host-service-unavailable";
import type { PaneViewerData } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { AppCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";
import {
	WORKSPACE_CREATE_ROLLBACK_TO_CANONICAL_ID,
	type WorkspaceCreateInsertMetadata,
} from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";
import {
	getPrependTabOrder,
	isSidebarWorkspaceVisible,
} from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { appendLaunchesToPaneLayout } from "./appendLaunchesToPaneLayout";

export type WorkspacesCreateInput =
	inferRouterInputs<AppRouter>["workspaces"]["create"];

export interface SubmitArgs {
	hostId: string;
	snapshot: WorkspacesCreateInput;
}

export type SubmitResult =
	| { ok: true; workspaceId: string; alreadyExists: boolean }
	| { ok: false; error: string };

export interface UseWorkspaceCreatesApi {
	submit: (args: SubmitArgs) => Promise<SubmitResult>;
}

const WORKSPACE_SYNC_TIMEOUT_MS = 5000;

function waitForSyncedWorkspaceRow(
	collection: AppCollections["v2Workspaces"],
	workspaceId: string,
): Promise<void> {
	const current = collection.get(workspaceId);
	if (current?.$synced === true) {
		return Promise.resolve();
	}

	return new Promise((resolve, reject) => {
		let settled = false;
		const timeoutId = setTimeout(() => {
			if (settled) return;
			settled = true;
			subscription.unsubscribe();
			reject(
				new Error(
					`Workspace ${workspaceId} did not sync to the local collection`,
				),
			);
		}, WORKSPACE_SYNC_TIMEOUT_MS);

		const finish = () => {
			if (settled) return;
			const row = collection.get(workspaceId);
			if (row?.$synced !== true) return;
			settled = true;
			clearTimeout(timeoutId);
			subscription.unsubscribe();
			resolve();
		};

		const subscription = collection.subscribeChanges(finish, {
			includeInitialState: false,
		});
		finish();
	});
}

export function useWorkspaceCreates(): UseWorkspaceCreatesApi {
	const hostService = useLocalHostService();
	const { machineId, activeHostUrl } = hostService;
	const { data: session } = authClient.useSession();
	const organizationId = session?.session?.activeOrganizationId;
	const userId = session?.user?.id ?? null;
	const collections = useCollections();
	const relayUrl = useRelayUrl();

	const submit = useCallback(
		async (args: SubmitArgs): Promise<SubmitResult> => {
			const workspaceId = args.snapshot.id;
			if (!workspaceId) {
				throw new Error("workspaces.create requires `id`");
			}
			if (!organizationId) {
				return { ok: false, error: "No active organization" };
			}
			const hostUrl = resolveHostUrl({
				hostId: args.hostId,
				machineId,
				activeHostUrl,
				organizationId,
				relayUrl,
			});
			if (!hostUrl) {
				return {
					ok: false,
					error: getHostServiceUnavailableMessage(hostService, {
						action: "create the workspace",
					}),
				};
			}

			const writeWorkspaceLocalState = (
				result: NonNullable<WorkspaceCreateInsertMetadata["result"]>,
			) => {
				const { workspace } = result;
				const existing = collections.v2WorkspaceLocalState.get(workspace.id);
				const paneLayout = appendLaunchesToPaneLayout({
					existing: existing?.paneLayout as
						| WorkspaceState<PaneViewerData>
						| undefined,
					terminals: result.terminals,
					agents: result.agents,
				});
				if (existing) {
					collections.v2WorkspaceLocalState.update(workspace.id, (draft) => {
						draft.paneLayout = paneLayout;
					});
				} else {
					const projectId = workspace.projectId;
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
						workspaceId: workspace.id,
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
			};

			try {
				if (collections.v2Workspaces.get(workspaceId)) {
					return {
						ok: true,
						workspaceId,
						alreadyExists: true,
					};
				}

				const metadata: WorkspaceCreateInsertMetadata = {
					hostUrl,
					input: args.snapshot,
				};

				const now = new Date();
				const tx = collections.v2Workspaces.insert(
					{
						id: workspaceId,
						organizationId,
						projectId: args.snapshot.projectId,
						hostId: args.hostId,
						name: args.snapshot.name ?? args.snapshot.branch ?? "New workspace",
						branch:
							args.snapshot.branch ?? args.snapshot.name ?? "New workspace",
						type: "worktree",
						createdByUserId: userId,
						taskId: args.snapshot.taskId ?? null,
						createdAt: now,
						updatedAt: now,
					} satisfies SelectV2Workspace,
					{ metadata },
				);

				try {
					await tx.isPersisted.promise;
				} catch (error) {
					const isExpectedRollback =
						error instanceof Error &&
						error.message === WORKSPACE_CREATE_ROLLBACK_TO_CANONICAL_ID &&
						metadata.result;
					if (!isExpectedRollback) {
						throw error;
					}
				}
				if (!metadata.result) {
					throw new Error("Workspace creation did not return a result");
				}
				await waitForSyncedWorkspaceRow(
					collections.v2Workspaces,
					metadata.result.workspace.id,
				);
				writeWorkspaceLocalState(metadata.result);
				return {
					ok: true,
					workspaceId: metadata.result.workspace.id,
					alreadyExists: metadata.result.alreadyExists,
				};
			} catch (err) {
				const error = err instanceof Error ? err.message : String(err);
				return { ok: false, error };
			}
		},
		[
			machineId,
			activeHostUrl,
			organizationId,
			userId,
			collections,
			relayUrl,
			hostService,
		],
	);
	return { submit };
}
