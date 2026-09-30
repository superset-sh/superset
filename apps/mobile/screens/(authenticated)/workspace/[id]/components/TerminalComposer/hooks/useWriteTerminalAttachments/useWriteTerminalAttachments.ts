import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { useMutation } from "@tanstack/react-query";
import { Alert } from "react-native";
import type { PromptInputAttachmentItem } from "@/components/ai-elements/prompt-input";
import { asAttachmentError } from "@/lib/attachments/errors";
import { awaitAttachmentUploads } from "@/lib/attachments/upload";
import { errorCopy } from "@/lib/errors";
import { getHostServiceClientByUrl } from "@/lib/host-service/client";
import { apiClient } from "@/lib/trpc/client";

export interface TerminalAttachmentTarget {
	workspaceId: string;
	hostUrl: string;
	/** A cloud box fetches only files attached to it, so they are attached first. */
	isCloud: boolean;
	/** Which draft the attachments (and their uploads) belong to. */
	draftKey: string;
}

interface WriteArgs {
	target: TerminalAttachmentTarget;
	attachments: PromptInputAttachmentItem[];
}

/**
 * Gets composer attachments into the workspace's worktree and returns their
 * worktree-relative paths. A live PTY only takes bytes, so paths are how an
 * attachment reaches the agent.
 *
 * The bytes go device → cloud storage → host, never through the relay: a
 * relay request body is buffered whole in a Cloudflare Worker and refused
 * above 100 MB by its edge, which is what made a large attachment fail with
 * an unparseable response rather than an error anyone could read.
 *
 * By here the upload is usually finished — it started when the file was
 * attached — so this waits only on what the message outpaced.
 */
export function useWriteTerminalAttachments() {
	return useMutation({
		mutationFn: async ({ target, attachments }: WriteArgs) => {
			if (attachments.length === 0) return [];
			const fileIds = await awaitAttachmentUploads(
				target.draftKey,
				attachments,
			);
			const client = getHostServiceClientByUrl(target.hostUrl);
			try {
				if (target.isCloud) {
					await apiClient.cloudWorkspace.attachFiles.mutate({
						id: target.workspaceId,
						fileIds,
					});
				}
				const { paths } =
					await client.attachments.materializeIntoWorkspace.mutate({
						workspaceId: target.workspaceId,
						fileIds,
					});
				return paths;
			} catch (error) {
				throw asAttachmentError(error);
			}
		},
		onError: (error) => {
			Alert.alert(
				i18n._(
					msg({
						message: "Could not attach files",
					}),
				),
				errorCopy(error),
			);
		},
	});
}
