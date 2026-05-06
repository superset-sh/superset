import type { SelectV2Workspace } from "@superset/db/schema";
import { useCallback } from "react";
import { resolveHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { authClient } from "renderer/lib/auth-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import {
	useWorkspaceCreateFailuresStore,
	WorkspaceAlreadyExistsAtDifferentIdError,
	type WorkspaceCreateMeta,
	type WorkspacesCreateInput,
} from "./store";

export interface SubmitArgs {
	hostId: string;
	snapshot: WorkspacesCreateInput;
}

export type SubmitResult =
	| { ok: true; workspaceId: string; alreadyExists: boolean }
	| { ok: false; error: string };

const PLACEHOLDER_WORKSPACE_NAME = "New workspace";

function buildOptimisticRow(args: {
	snapshot: WorkspacesCreateInput;
	hostId: string;
	organizationId: string;
	currentUserId: string | null;
	startedAt: number;
}): SelectV2Workspace {
	const { snapshot, hostId, organizationId, currentUserId, startedAt } = args;
	const created = new Date(startedAt);
	return {
		id: snapshot.id as string,
		organizationId,
		projectId: snapshot.projectId,
		hostId,
		name: snapshot.name ?? PLACEHOLDER_WORKSPACE_NAME,
		branch: snapshot.branch ?? snapshot.name ?? "",
		type: "worktree",
		createdByUserId: currentUserId,
		taskId: snapshot.taskId ?? null,
		createdAt: created,
		updatedAt: created,
	};
}

/**
 * Submits a v2 workspace.create as a tanstack-db optimistic insert against
 * `collections.v2Workspaces`. The handler in `collections.ts:onInsert` does
 * the host-service round-trip; this hook just builds the optimistic row +
 * metadata sidecar and translates the rollback into a failure record so the
 * detail page can offer retry.
 */
export function useWorkspaceCreates(): {
	submit: (args: SubmitArgs) => Promise<SubmitResult>;
} {
	const { machineId, activeHostUrl } = useLocalHostService();
	const { data: session } = authClient.useSession();
	const organizationId = session?.session?.activeOrganizationId;
	const currentUserId = session?.user?.id ?? null;
	const collections = useCollections();

	const submit = useCallback(
		async (args: SubmitArgs): Promise<SubmitResult> => {
			const workspaceId = args.snapshot.id;
			if (!workspaceId) {
				throw new Error(
					"workspaces.create requires `id` for optimistic insert",
				);
			}
			try {
				if (!organizationId) throw new Error("No active organization");
				const hostUrl = resolveHostUrl({
					hostId: args.hostId,
					machineId,
					activeHostUrl,
					organizationId,
				});
				if (!hostUrl) throw new Error("Host service not available");

				const meta: WorkspaceCreateMeta = {
					hostUrl,
					providedName: args.snapshot.name,
					providedBranch: args.snapshot.branch,
					pr: args.snapshot.pr,
					baseBranch: args.snapshot.baseBranch,
					agents: args.snapshot.agents,
				};
				const tx = collections.v2Workspaces.insert(
					buildOptimisticRow({
						snapshot: args.snapshot,
						hostId: args.hostId,
						organizationId,
						currentUserId,
						startedAt: Date.now(),
					}),
					{ metadata: meta as unknown as Record<string, unknown> },
				);
				await tx.isPersisted.promise;
				useWorkspaceCreateFailuresStore.getState().clear(workspaceId);
				return { ok: true, workspaceId, alreadyExists: false };
			} catch (err) {
				if (err instanceof WorkspaceAlreadyExistsAtDifferentIdError) {
					useWorkspaceCreateFailuresStore.getState().clear(workspaceId);
					return {
						ok: true,
						workspaceId: err.canonicalWorkspaceId,
						alreadyExists: true,
					};
				}
				const error = err instanceof Error ? err.message : String(err);
				useWorkspaceCreateFailuresStore.getState().record(workspaceId, {
					hostId: args.hostId,
					snapshot: args.snapshot,
					error,
					failedAt: Date.now(),
				});
				return { ok: false, error };
			}
		},
		[machineId, activeHostUrl, organizationId, currentUserId, collections],
	);

	return { submit };
}
