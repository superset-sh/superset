import { useLingui } from "@lingui/react/macro";
import { acpHarnessForPreset } from "@superset/chat/core";
import type { UserContent } from "@superset/chat/protocol";
import {
	getAgentEfforts,
	getAgentModelSupport,
} from "@superset/shared/agent-models";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import { useRouter } from "expo-router";
import { useFeatureFlag } from "posthog-react-native";
import { Alert } from "react-native";
import { getHostWorkspacesQueryKey } from "@/hooks/useHostWorkspaces";
import { asAttachmentError } from "@/lib/attachments/errors";
import { getChatTransport } from "@/lib/chat";
import { errorCopy, transportFailureKind } from "@/lib/errors";
import { getHostServiceClientByUrl } from "@/lib/host-service/client";
import { isMissingProcedureError } from "@/lib/host-service/errors";
import { posthog } from "@/lib/posthog";
import { getHostTerminalsQueryKey } from "@/screens/(authenticated)/(home)/home/hooks/useHostTerminals";
import { useAppReviewStore } from "@/screens/(authenticated)/stores/appReviewStore";
import { usePendingChatLaunchStore } from "@/screens/(authenticated)/stores/pendingChatLaunchStore";
import {
	type PendingWorkspaceCreateInput,
	usePendingWorkspaceCreatesStore,
} from "@/screens/(authenticated)/stores/pendingWorkspaceCreatesStore";
import { hostStartsChats } from "@/screens/(authenticated)/utils/hostStartsChats";

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
) {
	if (fileIds.length === 0) return [];
	try {
		return await client.attachments.importFromCloud.mutate({ fileIds });
	} catch (error) {
		throw asAttachmentError(error);
	}
}

const WORKSPACE_ROW_POLL_MS = 2_000;
const WORKSPACE_ROW_TIMEOUT_MS = 5 * 60_000;
const NAMING_PROMPT_MAX_CHARS = 20_000;

class WorkspaceRowTimeoutError extends Error {}

async function waitForWorkspaceRow(
	client: ReturnType<typeof getHostServiceClientByUrl>,
	workspaceId: string,
): Promise<void> {
	const deadline = Date.now() + WORKSPACE_ROW_TIMEOUT_MS;
	while (Date.now() < deadline) {
		const rows = await client.workspace.list.query().catch(() => null);
		if (rows?.some((row) => row.id === workspaceId)) return;
		await new Promise((resolve) => setTimeout(resolve, WORKSPACE_ROW_POLL_MS));
	}
	throw new WorkspaceRowTimeoutError();
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
	const { t } = useLingui();
	const router = useRouter();
	const queryClient = useQueryClient();
	const startPending = usePendingWorkspaceCreatesStore((state) => state.start);
	const failPending = usePendingWorkspaceCreatesStore((state) => state.fail);
	const clearPending = usePendingWorkspaceCreatesStore((state) => state.clear);
	const acpChat = Boolean(useFeatureFlag(FEATURE_FLAGS.ACP_CHAT));
	const queueChatLaunch = usePendingChatLaunchStore((state) => state.queue);

	return useMutation({
		mutationFn: async ({ replace, ...input }: CreateTerminalWorkspaceArgs) => {
			const { target, baseBranch, agentId, model, effort, message } = input;
			const chatHarness = acpChat ? acpHarnessForPreset(agentId) : undefined;
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

			// Attachments upload before the create is sent, so a failure there
			// proves the workspace was never requested — only a failure at or
			// after the create itself leaves the outcome unknown.
			let createRequested = false;
			let startChatOnPhone: (() => void) | null = null;
			try {
				const client = getHostServiceClientByUrl(target.hostUrl);
				const imported = await importAttachments(
					client,
					input.attachmentFileIds,
				);
				const attachmentIds = imported.map((entry) => entry.attachmentId);
				const prompt = message.text.trim();
				const hostLaunchesChat =
					!!chatHarness &&
					hostStartsChats(
						await client.host.info
							.query()
							.then((info) => info.version)
							.catch(() => null),
					);
				const phoneLaunchesChat = !!chatHarness && !hostLaunchesChat;

				const agents = phoneLaunchesChat
					? undefined
					: [
							{
								agent: agentId,
								prompt,
								attachmentIds:
									attachmentIds.length > 0 ? attachmentIds : undefined,
								model: model ?? undefined,
								...(hostLaunchesChat
									? { surface: "chat" as const }
									: { effort: effort ?? undefined }),
							},
						];
				const naming =
					phoneLaunchesChat && prompt
						? {
								namingPrompt: prompt.slice(0, NAMING_PROMPT_MAX_CHARS),
								namingAgent: agentId,
							}
						: {};

				const refetchCreated = () => {
					void queryClient.invalidateQueries({
						queryKey: getHostWorkspacesQueryKey(
							target.machineId,
							target.hostUrl,
						),
					});
					void queryClient.invalidateQueries({
						queryKey: getHostTerminalsQueryKey(target.machineId),
					});
				};

				startChatOnPhone = () => {
					if (!chatHarness) return;
					void (async () => {
						try {
							await waitForWorkspaceRow(client, workspaceId);
							const created = await getChatTransport(
								target.hostUrl,
							).createSession({
								commandId: randomUUID(),
								workspaceId,
								harness: chatHarness,
								modelId: model ?? undefined,
							});
							const content: UserContent[] = [
								...(prompt ? [{ type: "text" as const, text: prompt }] : []),
								...imported.map((entry) => ({
									type: "attachment" as const,
									attachmentId: entry.attachmentId,
									name: entry.originalFilename ?? "attachment",
									mimeType: entry.mediaType,
								})),
							];
							queueChatLaunch(created.sessionId, {
								content,
								modelLabel:
									getAgentModelSupport(agentId)?.models.find(
										(option) => option.id === model,
									)?.label ?? null,
								effortLabel:
									getAgentEfforts(agentId, model ?? undefined).find(
										(option) => option.id === effort,
									)?.label ?? null,
							});
							refetchCreated();
						} catch (error) {
							if (error instanceof WorkspaceRowTimeoutError) {
								failPending(workspaceId, {
									outcome: "unknown",
									message: t({ message: "The host hasn't answered." }),
								});
								return;
							}
							clearPending(workspaceId);
							Alert.alert(
								t({ message: "Could not start the chat" }),
								errorCopy(error),
							);
						}
					})();
				};

				if (target.projectId === null) {
					createRequested = true;
					await client.workspaces.createSession.mutate({
						id: workspaceId,
						agents,
						...naming,
					});
					refetchCreated();
				} else {
					const createInput = {
						id: workspaceId,
						projectId: target.projectId,
						baseBranch: baseBranch ?? undefined,
						agents,
						...naming,
					};
					try {
						createRequested = true;
						await client.workspaces.createEnqueued.mutate(createInput);
					} catch (error) {
						if (!isMissingProcedureError(error)) throw error;
						// Legacy host: the long-held synchronous create — it can still
						// die at the relay's 30s cap, same as before this hook went
						// optimistic. On success the row and session already exist;
						// refetch so the screen resolves without waiting for a poll.
						await client.workspaces.create.mutate(createInput);
						refetchCreated();
					}
				}
				if (phoneLaunchesChat) startChatOnPhone();
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
					surface: chatHarness ? "chat" : "terminal",
				});
				useAppReviewStore.getState().recordWorkspaceCreated();
				return { workspaceId };
			} catch (error) {
				// A transport failure proves nothing about the worktree: the
				// relay's 30s cap can reject a create the host went on to
				// finish. Say so rather than asserting a failure.
				const kind = transportFailureKind(error);
				if (kind && createRequested) startChatOnPhone?.();
				failPending(workspaceId, {
					outcome: kind && createRequested ? "unknown" : "failed",
					message: errorCopy(error),
				});
				posthog.capture("workspace_create_failed", {
					project_id: target.projectId,
					host_kind: "remote",
					source: "mobile_composer",
					// Stable English, never the display copy above.
					failure_kind: kind ?? "server",
				});
				throw error;
			}
		},
	});
}
