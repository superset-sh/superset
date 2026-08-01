import { useCallback } from "react";
import { resolveHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { useRelayUrl } from "renderer/hooks/useRelayUrl";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { getHostServiceUnavailableMessage } from "renderer/lib/host-service-unavailable";
import { electronTrpcClient } from "renderer/lib/trpc-client";
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
	const { data: waitForSetupBeforeAgent } =
		electronTrpc.settings.getWaitForSetupBeforeAgent.useQuery();

	const submit = useCallback(
		(args: SubmitArgs): SubmitHandle => {
			const { snapshot } = args;
			const workspaceId = snapshot.id;
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
					input: snapshot,
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
				projectId: snapshot.projectId,
				hostId: args.hostId,
				name: snapshot.name ?? snapshot.branch ?? "New workspace",
				branch: snapshot.branch ?? snapshot.name ?? "New workspace",
				type: "worktree",
				createdByUserId: userId,
				taskId: snapshot.taskId ?? null,
				createdAt: now,
				updatedAt: now,
				worktreePath: "",
				worktreeExists: true,
			});

			// The wait-for-setup gate is a desktop setting the host can't read;
			// send it with every agent-carrying create so the host chains the
			// agent behind the setup commands. On a cold cache the hook value is
			// still undefined — resolve it directly so an early create can't
			// silently skip the gate (failures fall back to default-off).
			const createPromise = (async () => {
				let waitForSetup = waitForSetupBeforeAgent;
				if (waitForSetup === undefined && snapshot.agents?.length) {
					waitForSetup =
						await electronTrpcClient.settings.getWaitForSetupBeforeAgent
							.query()
							.catch(() => false);
				}
				const payload: WorkspacesCreateInput =
					snapshot.agents?.length && waitForSetup
						? { ...snapshot, waitForSetupBeforeAgents: true }
						: snapshot;
				return getHostServiceClientByUrl(hostUrl).workspaces.create.mutate(
					payload,
				);
			})();

			writeWorkspacePaneLayout(
				collections,
				{ id: workspaceId, projectId: snapshot.projectId },
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
			waitForSetupBeforeAgent,
		],
	);

	return { submit };
}
