import { useMutation, useQueryClient } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { randomUUID } from "expo-crypto";
import { File } from "expo-file-system";
import { useRouter } from "expo-router";
import { getHostWorkspacesQueryKey } from "@/hooks/useHostWorkspaces";
import { getHostServiceClientByUrl } from "@/lib/host-service/client";
import { track } from "@/lib/posthog";
import { getHostTerminalsQueryKey } from "@/screens/(authenticated)/(home)/home/hooks/useHostTerminals";
import {
	type PendingWorkspaceCreateInput,
	usePendingWorkspaceCreatesStore,
} from "@/screens/(authenticated)/stores/pendingWorkspaceCreatesStore";

const FALLBACK_MEDIA_TYPE = "application/octet-stream";

/** Older hosts don't have `workspaces.createEnqueued` yet. */
function isMissingProcedureError(error: unknown): boolean {
	return (
		error instanceof TRPCClientError &&
		/no procedure found on path/i.test(error.message)
	);
}

type CreateTerminalWorkspaceArgs = PendingWorkspaceCreateInput & {
	/** Retry from the failed state replaces instead of pushing. */
	replace?: boolean;
};

/**
 * Creates a workspace on the target host with the claude agent sugar — the
 * host launches the terminal agent and delivers the first prompt itself.
 * Attachments upload to the same host first (they're host-local).
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
			const { target, baseBranch, agentId, message } = input;
			const workspaceId = randomUUID();
			const startedAt = Date.now();
			startPending({
				workspaceId,
				hostId: target.machineId,
				hostUrl: target.hostUrl,
				startedAt,
				input,
			});
			// The three states the screen already models. Enqueued is the
			// optimistic navigation, before the host has been asked at all.
			const createProperties = {
				workspace_id: workspaceId,
				project_id: target.projectId,
				host_id: target.machineId,
				host_kind: "remote",
				source: "mobile_composer",
				base_branch: baseBranch,
				agent: agentId,
				is_retry: replace === true,
			};
			track("workspace_create_enqueued", createProperties);
			const href = `/(authenticated)/workspace/${workspaceId}` as const;
			if (replace) router.replace(href);
			else router.push(href);

			try {
				const client = getHostServiceClientByUrl(target.hostUrl);
				const attachmentIds = await Promise.all(
					message.attachments.map(async (attachment) => {
						const base64 = await new File(attachment.uri).base64();
						const uploaded = await client.attachments.upload.mutate({
							data: { kind: "base64", data: base64 },
							mediaType: attachment.mediaType ?? FALLBACK_MEDIA_TYPE,
							originalFilename: attachment.name,
						});
						return uploaded.attachmentId;
					}),
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
						},
					],
				};

				let enqueued = true;
				try {
					await client.workspaces.createEnqueued.mutate(createInput);
				} catch (error) {
					if (!isMissingProcedureError(error)) throw error;
					// Legacy host: the long-held synchronous create — it can still
					// die at the relay's 30s cap, same as before this hook went
					// optimistic. On success the row and session already exist;
					// refetch so the screen resolves without waiting for a poll.
					await client.workspaces.create.mutate(createInput);
					enqueued = false;
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
				// The host has accepted it. On the enqueued path the worktree is
				// still being built — the workspace screen polls for the row — but
				// this is the last thing the client is told either way.
				track("workspace_created", {
					...createProperties,
					enqueued,
					attachment_count: attachmentIds.length,
					latency_ms: Date.now() - startedAt,
				});
				return { workspaceId };
			} catch (error) {
				const failureReason =
					error instanceof Error ? error.message : String(error);
				failPending(workspaceId, failureReason);
				track("workspace_create_failed", {
					...createProperties,
					failure_reason: failureReason,
					latency_ms: Date.now() - startedAt,
				});
				throw error;
			}
		},
	});
}
