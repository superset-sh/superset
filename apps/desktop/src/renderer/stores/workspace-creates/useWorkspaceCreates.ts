import { useCallback } from "react";
import { resolveHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { useRelayUrl } from "renderer/hooks/useRelayUrl";
import { authClient } from "renderer/lib/auth-client";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { getHostServiceUnavailableMessage } from "renderer/lib/host-service-unavailable";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { WorkspacesCreateInput } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useWorkspaceTransactionsStore } from "./workspaceTransactions";
import { writeWorkspacePaneLayout } from "./writeWorkspacePaneLayout";

export type { WorkspacesCreateInput };

export interface SubmitArgs {
	hostId: string;
	snapshot: WorkspacesCreateInput;
}

export type SubmitOutcome =
	| { ok: true; workspaceId: string; autoNameWarning?: string }
	| { ok: false; error: string };

export interface SubmitHandle {
	workspaceId: string;
	completed: Promise<SubmitOutcome>;
}

export interface UseWorkspaceCreatesApi {
	submit: (args: SubmitArgs) => SubmitHandle;
}

export function useWorkspaceCreates(): UseWorkspaceCreatesApi {
	const hostService = useLocalHostService();
	const { machineId, activeHostUrl } = hostService;
	const { data: session } = authClient.useSession();
	const organizationId = session?.session?.activeOrganizationId;
	const userId = session?.user?.id ?? null;
	const collections = useCollections();
	const { cache: hostWorkspacesCache } = useHostWorkspaces();
	const relayUrl = useRelayUrl();
	const trackWorkspaceTransaction = useWorkspaceTransactionsStore(
		(state) => state.track,
	);

	const submit = useCallback(
		(args: SubmitArgs): SubmitHandle => {
			const workspaceId = args.snapshot.id;
			if (!workspaceId) {
				throw new Error("workspaces.create requires `id`");
			}

			const recordFailure = (error: string) => {
				if (collections.failedWorkspaceCreates.get(workspaceId)) {
					collections.failedWorkspaceCreates.delete(workspaceId);
				}
				collections.failedWorkspaceCreates.insert({
					id: workspaceId,
					hostId: args.hostId,
					input: args.snapshot,
					error,
					failedAt: new Date(),
				});
			};

			const deleteWorkspaceLocalState = (id: string) => {
				if (collections.v2WorkspaceLocalState.get(id)) {
					collections.v2WorkspaceLocalState.delete(id);
				}
			};

			const hostUrl = organizationId
				? resolveHostUrl({
						hostId: args.hostId,
						machineId,
						activeHostUrl,
						organizationId,
						relayUrl,
					})
				: null;

			if (!organizationId || !hostUrl) {
				const error = !organizationId
					? "No active organization"
					: getHostServiceUnavailableMessage(hostService, {
							action: "create the workspace",
						});
				recordFailure(error);
				return {
					workspaceId,
					completed: Promise.resolve<SubmitOutcome>({ ok: false, error }),
				};
			}

			if (collections.failedWorkspaceCreates.get(workspaceId)) {
				collections.failedWorkspaceCreates.delete(workspaceId);
			}

			const now = new Date();
			// Optimistic entry in the host's cached list; the host's
			// workspace:changed broadcast replaces it with the real row.
			hostWorkspacesCache.upsertWorkspace({
				id: workspaceId,
				organizationId,
				projectId: args.snapshot.projectId,
				hostId: args.hostId,
				name: args.snapshot.name ?? args.snapshot.branch ?? "New workspace",
				branch: args.snapshot.branch ?? args.snapshot.name ?? "New workspace",
				type: "worktree",
				createdByUserId: userId,
				taskId: args.snapshot.taskId ?? null,
				createdAt: now,
				updatedAt: now,
				worktreePath: "",
				worktreeExists: true,
			});

			const createPromise = getHostServiceClientByUrl(
				hostUrl,
			).workspaces.create.mutate(args.snapshot);

			writeWorkspacePaneLayout(
				collections,
				{ id: workspaceId, projectId: args.snapshot.projectId },
				[],
				[],
			);

			const completed = createPromise
				.then<SubmitOutcome>((result) => {
					writeWorkspacePaneLayout(
						collections,
						result.workspace,
						result.terminals,
						result.agents,
					);
					if (result.workspace.id !== workspaceId) {
						deleteWorkspaceLocalState(workspaceId);
						hostWorkspacesCache.removeWorkspace(args.hostId, workspaceId);
					}
					return {
						ok: true,
						workspaceId: result.workspace.id,
						autoNameWarning: result.autoNameWarning,
					};
				})
				.catch<SubmitOutcome>((error: unknown) => {
					const message =
						error instanceof Error ? error.message : String(error);
					hostWorkspacesCache.removeWorkspace(args.hostId, workspaceId);
					deleteWorkspaceLocalState(workspaceId);
					recordFailure(message);
					return { ok: false, error: message };
				});

			// Track against `completed` (not the raw mutation promise) so the
			// pending-create UI holds until the resolved pane layout — agent and
			// terminal panes — has been written. The host broadcasts the workspace
			// row mid-create, before agents/terminals launch, so clearing any
			// earlier would drop the user into a briefly-empty workspace.
			trackWorkspaceTransaction(workspaceId, {
				id: workspaceId,
				state: "persisting",
				createdAt: now,
				mutations: [{ type: "insert" }],
				isPersisted: { promise: completed },
			});

			return { workspaceId, completed };
		},
		[
			machineId,
			activeHostUrl,
			organizationId,
			userId,
			collections,
			hostWorkspacesCache,
			relayUrl,
			hostService,
			trackWorkspaceTransaction,
		],
	);

	return { submit };
}
