import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import {
	assignAttachmentFileName,
	WORKSPACE_ATTACHMENTS_DIR,
} from "@superset/shared/workspace-attachments";
import { useMutation } from "@tanstack/react-query";
import { File } from "expo-file-system";
import { Alert } from "react-native";
import type { PromptInputAttachmentItem } from "@/components/ai-elements/prompt-input";
import { getHostServiceClientByUrl } from "@/lib/host-service/client";

export interface TerminalAttachmentTarget {
	workspaceId: string;
	hostUrl: string;
	worktreePath: string;
}

interface WriteArgs {
	target: TerminalAttachmentTarget;
	attachments: PromptInputAttachmentItem[];
}

/**
 * Generated names keep the uri's extension when the picker gave us no
 * filename — an extensionless image is one an agent has to guess at.
 */
function extensionOf(value: string): string {
	const name = value.split("?")[0]?.split("/").pop() ?? "";
	const dot = name.lastIndexOf(".");
	return dot > 0 ? name.slice(dot) : "";
}

/**
 * Writes composer attachments into the workspace's worktree over the host
 * service and returns their worktree-relative paths, mirroring what the
 * desktop terminal adapter does at agent launch. A live PTY only takes bytes,
 * so paths are how an attachment reaches the agent.
 */
export function useWriteTerminalAttachments() {
	return useMutation({
		mutationFn: async ({ target, attachments }: WriteArgs) => {
			if (attachments.length === 0) return [];
			const client = getHostServiceClientByUrl(target.hostUrl);
			const directory = `${target.worktreePath}/${WORKSPACE_ATTACHMENTS_DIR}`;
			await client.filesystem.createDirectory.mutate({
				workspaceId: target.workspaceId,
				absolutePath: directory,
				recursive: true,
			});

			const used = new Set<string>();
			const paths: string[] = [];
			for (const [index, attachment] of attachments.entries()) {
				const fileName = assignAttachmentFileName({
					rawName: attachment.name,
					index,
					used,
					fallbackExtension: extensionOf(attachment.uri),
				});
				await client.filesystem.writeFile.mutate({
					workspaceId: target.workspaceId,
					absolutePath: `${directory}/${fileName}`,
					content: {
						kind: "base64",
						data: await new File(attachment.uri).base64(),
					},
				});
				paths.push(`${WORKSPACE_ATTACHMENTS_DIR}/${fileName}`);
			}
			return paths;
		},
		onError: (error) => {
			Alert.alert(
				i18n._(
					msg({
						message: "Could not attach files",
					}),
				),
				error instanceof Error ? error.message : String(error),
			);
		},
	});
}
