import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback } from "react";
import { normalizeTerminalCommand } from "renderer/lib/terminal/launch-command";

export type AgentPromptFileSide = "additions" | "deletions" | "mixed";

export interface AgentPromptFileContext {
	path: string;
	startLine: number;
	endLine: number;
	/** Diff side the selection covers; omitted for single-file viewers.
	 *  `deletions`/`mixed` are tagged since their lines refer to the pre-diff file. */
	side?: AgentPromptFileSide;
}

interface FormatPromptInput {
	comment: string;
	file: AgentPromptFileContext;
}

/** Build a CLI-agent prompt body anchored to a file/line range. */
export function formatAgentPromptWithFileContext({
	comment,
	file,
}: FormatPromptInput): string {
	const range =
		file.startLine === file.endLine
			? `L${file.startLine}`
			: `L${file.startLine}-L${file.endLine}`;
	const sideSuffix =
		file.side === "deletions"
			? " (deleted lines)"
			: file.side === "mixed"
				? " (across deletions and additions)"
				: "";
	// ponytail: empty comment → emit just the anchor (no dangling ": ").
	const note = comment.trim();
	return note
		? `In ${file.path}:${range}${sideSuffix}: ${note}`
		: `In ${file.path}:${range}${sideSuffix}`;
}

export interface SendToTerminalAgentInput {
	workspaceId: string;
	terminalId: string;
	/** Already-formatted prompt body. Trailing newline is added by the hook. */
	text: string;
}

interface UseSendToTerminalAgentResult {
	send: (input: SendToTerminalAgentInput) => Promise<void>;
	isPending: boolean;
}

/** Shared writer for pushing a prompt into an existing terminal agent's pty,
 *  keeping payload normalization + the error toast consistent across callers. */
export function useSendToTerminalAgent(): UseSendToTerminalAgentResult {
	const writeInput = workspaceTrpc.terminal.writeInput.useMutation();

	const send = useCallback(
		async ({ workspaceId, terminalId, text }: SendToTerminalAgentInput) => {
			try {
				await writeInput.mutateAsync({
					workspaceId,
					terminalId,
					data: normalizeTerminalCommand(text),
				});
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Unknown error";
				toast.error("Couldn't send to agent", { description: message });
				throw error;
			}
		},
		[writeInput],
	);

	return { send, isPending: writeInput.isPending };
}
