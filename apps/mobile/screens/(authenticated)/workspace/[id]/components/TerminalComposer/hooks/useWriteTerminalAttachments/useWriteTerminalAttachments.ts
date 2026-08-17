import { useMutation } from "@tanstack/react-query";
import { File } from "expo-file-system";
import { Alert } from "react-native";
import type { PromptInputAttachmentItem } from "@/components/ai-elements/prompt-input";
import { getHostServiceClientByUrl } from "@/lib/host-service/client";

/** Worktree-relative, so the paths read the same to the agent as to the user. */
const ATTACHMENTS_DIRECTORY = ".superset/attachments";

export interface TerminalAttachmentTarget {
	workspaceId: string;
	hostUrl: string;
	worktreePath: string;
}

interface WriteArgs {
	target: TerminalAttachmentTarget;
	attachments: PromptInputAttachmentItem[];
}

function extensionOf(value: string): string {
	const name = value.split("?")[0]?.split("/").pop() ?? "";
	const dot = name.lastIndexOf(".");
	return dot > 0 ? name.slice(dot) : "";
}

/**
 * Unique, shell-safe name for one attachment. Falls back to the uri's
 * extension when the picker gave us no filename — an extensionless image is
 * one an agent has to guess at.
 */
function fileNameFor(
	attachment: PromptInputAttachmentItem,
	index: number,
	used: Set<string>,
): string {
	const sanitized = (attachment.name ?? "").replace(/[^a-zA-Z0-9._-]/g, "_");
	const base = sanitized.trim()
		? sanitized
		: `attachment_${index + 1}${extensionOf(attachment.uri)}`;

	if (!used.has(base)) {
		used.add(base);
		return base;
	}
	const extension = extensionOf(base);
	const stem = extension ? base.slice(0, -extension.length) : base;
	let counter = 1;
	let candidate = `${stem}_${counter}${extension}`;
	while (used.has(candidate)) {
		counter += 1;
		candidate = `${stem}_${counter}${extension}`;
	}
	used.add(candidate);
	return candidate;
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
			const directory = `${target.worktreePath}/${ATTACHMENTS_DIRECTORY}`;
			await client.filesystem.createDirectory.mutate({
				workspaceId: target.workspaceId,
				absolutePath: directory,
				recursive: true,
			});

			const used = new Set<string>();
			const paths: string[] = [];
			for (const [index, attachment] of attachments.entries()) {
				const fileName = fileNameFor(attachment, index, used);
				await client.filesystem.writeFile.mutate({
					workspaceId: target.workspaceId,
					absolutePath: `${directory}/${fileName}`,
					content: {
						kind: "base64",
						data: await new File(attachment.uri).base64(),
					},
				});
				paths.push(`${ATTACHMENTS_DIRECTORY}/${fileName}`);
			}
			return paths;
		},
		onError: (error) => {
			Alert.alert(
				"Could not attach files",
				error instanceof Error ? error.message : String(error),
			);
		},
	});
}
