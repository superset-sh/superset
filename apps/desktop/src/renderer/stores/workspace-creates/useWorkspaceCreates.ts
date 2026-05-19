import type { SelectV2Workspace } from "@superset/db/schema";
import { useCallback } from "react";
import { resolveHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { useRelayUrl } from "renderer/hooks/useRelayUrl";
import { authClient } from "renderer/lib/auth-client";
import { getHostServiceUnavailableMessage } from "renderer/lib/host-service-unavailable";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { WorkspaceCreateMutationMetadata } from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";
import type { WorkspacesCreateInput } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { writeWorkspacePaneLayout } from "./writeWorkspacePaneLayout";

export type { WorkspacesCreateInput };

export interface SubmitArgs {
	hostId: string;
	snapshot: WorkspacesCreateInput;
}

export type SubmitOutcome =
	| { ok: true; workspaceId: string }
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
	const relayUrl = useRelayUrl();

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
			const optimisticRow = {
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
			} satisfies SelectV2Workspace;

			const metadata: WorkspaceCreateMutationMetadata = {
				hostUrl,
				input: args.snapshot,
			};

			const transaction = collections.v2Workspaces.insert(optimisticRow, {
				metadata,
			});
			writeWorkspacePaneLayout(
				collections,
				{ id: workspaceId, projectId: args.snapshot.projectId },
				[],
				[],
			);

			const completed = transaction.isPersisted.promise
				.then<SubmitOutcome>(() => {
					const result = metadata.result;
					if (!result) {
						return { ok: true, workspaceId };
					}
					writeWorkspacePaneLayout(
						collections,
						result.workspace,
						result.terminals,
						result.agents,
					);
					if (result.workspace.id !== workspaceId) {
						deleteWorkspaceLocalState(workspaceId);
					}
					return { ok: true, workspaceId: result.workspace.id };
				})
				.catch<SubmitOutcome>((error: unknown) => {
					const message =
						error instanceof Error ? error.message : String(error);
					deleteWorkspaceLocalState(workspaceId);
					recordFailure(message);
					return { ok: false, error: message };
				});

			return { workspaceId, completed };
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
