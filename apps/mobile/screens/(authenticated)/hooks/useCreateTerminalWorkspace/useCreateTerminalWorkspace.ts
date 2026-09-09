import { useMutation, useQueryClient } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import { useRouter } from "expo-router";
import { getHostWorkspacesQueryKey } from "@/hooks/useHostWorkspaces";
import { asAttachmentError } from "@/lib/attachments/errors";
import { getHostServiceClientByUrl } from "@/lib/host-service/client";
import { isMissingProcedureError } from "@/lib/host-service/errors";
import { posthog } from "@/lib/posthog";
import { getHostTerminalsQueryKey } from "@/screens/(authenticated)/(home)/home/hooks/useHostTerminals";
import {
	type PendingWorkspaceCreateInput,
	usePendingWorkspaceCreatesStore,
} from "@/screens/(authenticated)/stores/pendingWorkspaceCreatesStore";

type CreateTerminalWorkspaceArgs = PendingWorkspaceCreateInput & {
	/** Retry from the failed state replaces instead of pushing. */
	replace?: boolean;
};

/**
 * Pulls the already-uploaded attachments onto the host. The bytes skip the
 * relay entirely — they went device → cloud storage when the files were
 * attached — because a relay request body is buffered whole in a Cloudflare
 * Worker and refused by its edge above 100 MB.
 */
async function importAttachments(
	client: ReturnType<typeof getHostServiceClientByUrl>,
	fileIds: string[],
): Promise<string[]> {
	if (fileIds.length === 0) return [];
	try {
		const imported = await client.attachments.importFromCloud.mutate({
			fileIds,
		});
		return imported.map((entry) => entry.attachmentId);
	} catch (error) {
		throw asAttachmentError(error);
	}
}

/**
 * Creates a workspace on the target host with the claude agent sugar — the
 * host launches the terminal agent and delivers the first prompt itself.
 * Attachments reach that host through cloud storage first, since the agent
 * needs them on disk before it launches.
 *
 * Navigation is optimistic: the id is minted client-side and the workspace
 * screen is pushed before the host is asked, because the full create
 * (worktree add, AI naming, agent dispatch) outlives the relay's 30s exchange
 * cap. `workspaces.createEnqueued` validates and returns immediately; its
 * settled event only exists on the desktop's event bus, so the workspace
 * screen instead polls the pending create until the row and session appear.
 * Failures surface on that screen too (via the store's `error`), never here.
 */
export function useCreateTerminalWorkspace() {
	const router = useRouter();
	const queryClient = useQueryClient();
	const startPending = usePendingWorkspaceCreatesStore((state) => state.start);
	const failPending = usePendingWorkspaceCreatesStore((state) => state.fail);

	return useMutation({
		mutationFn: async ({ replace, ...input }: CreateTerminalWorkspaceArgs) => {
			const { target, baseBranch, agentId, model, effort, message } = input;
			const workspaceId = randomUUID();
			startPending({
				workspaceId,
				hostId: target.machineId,
				hostUrl: target.hostUrl,
				startedAt: Date.now(),
				input,
			});
			const href = `/(authenticated)/workspace/${workspaceId}` as const;
			if (replace) router.replace(href);
			else router.push(href);

			try {
				const client = getHostServiceClientByUrl(target.hostUrl);
				const attachmentIds = await importAttachments(
					client,
					input.attachmentFileIds,
				);

				const createInput = {
					id: workspaceId,
					projectId: target.projectId,
					baseBranch: baseBranch ?? undefined,
					agents: [
						{
							agent: agentId,
							prompt: message.text.trim(),
							attachmentIds:
								attachmentIds.length > 0 ? attachmentIds : undefined,
							model: model ?? undefined,
							effort: effort ?? undefined,
						},
					],
				};

				try {
					await client.workspaces.createEnqueued.mutate(createInput);
				} catch (error) {
					if (!isMissingProcedureError(error)) throw error;
					// Legacy host: the long-held synchronous create — it can still
					// die at the relay's 30s cap, same as before this hook went
					// optimistic. On success the row and session already exist;
					// refetch so the screen resolves without waiting for a poll.
					await client.workspaces.create.mutate(createInput);
					void queryClient.invalidateQueries({
						queryKey: getHostWorkspacesQueryKey(
							target.machineId,
							target.hostUrl,
						),
					});
					void queryClient.invalidateQueries({
						queryKey: getHostTerminalsQueryKey(target.machineId),
					});
				}
				// The host emits `workspace_created` itself when the row lands; this
				// is only the client asking, and counting both would double.
				posthog.capture("workspace_create_requested", {
					workspace_id: workspaceId,
					project_id: target.projectId,
					host_kind: "remote",
					source: "mobile_composer",
					base_branch: baseBranch,
					agent: agentId,
					model,
					effort,
				});
				return { workspaceId };
			} catch (error) {
				const failureReason =
					error instanceof Error ? error.message : String(error);
				failPending(workspaceId, failureReason);
				posthog.capture("workspace_create_failed", {
					project_id: target.projectId,
					host_kind: "remote",
					source: "mobile_composer",
				});
				throw error;
			}
		},
	});
}
