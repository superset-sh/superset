import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback } from "react";
import { normalizeTerminalCommand } from "renderer/lib/terminal/launch-command";

export interface AgentPromptFileContext {
	path: string;
	startLine: number;
	endLine: number;
}

interface FormatPromptInput {
	comment: string;
	file: AgentPromptFileContext;
}

/**
 * Build the prompt body for sending a comment to a CLI agent that should
 * be anchored to a specific file/line range (e.g. inline diff comments,
 * file-viewer selections). Keep this stable so consumers can format the
 * same way without sharing logic.
 */
export function formatAgentPromptWithFileContext({
	comment,
	file,
}: FormatPromptInput): string {
	const range =
		file.startLine === file.endLine
			? `L${file.startLine}`
			: `L${file.startLine}-L${file.endLine}`;
	return `In ${file.path}:${range}: ${comment}`;
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

/**
 * Shared writer for pushing a comment/prompt into an existing terminal
 * agent's pty via the host-service `terminal.writeInput` mutation.
 * Surfaces (DiffPane composer, file-viewer comments, etc.) should funnel
 * through this so the payload normalization + error toast stay consistent.
 */
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
