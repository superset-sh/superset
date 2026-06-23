import type { SendToTerminalAgentInput } from "renderer/hooks/host-service/useSendToTerminalAgent";
import type {
	AgentSessionPlacement,
	AgentTarget,
} from "../../../../../../../../DiffPane/components/AgentCommentComposer";

/** Outcome of a dispatch attempt. `sent` → delivered; `failed` → the caller
 *  keeps state for retry (a toast was already surfaced); `no-launcher` → a new
 *  session was required but no launcher was wired (never a silent drop). */
export type DispatchOutcome = "sent" | "failed" | "no-launcher";

interface DispatchSelectionArgs {
	workspaceId: string;
	/** Already-formatted, already-bounded prompt body. */
	text: string;
	/** The resolved target, or null when the ladder produced nothing. */
	target: AgentTarget | null;
	sendToTerminalAgent: (input: SendToTerminalAgentInput) => Promise<void>;
	onCreateNewAgentSession?: (input: {
		configId: string;
		placement: AgentSessionPlacement;
		prompt: string;
	}) => Promise<{ terminalId: string } | null>;
	/** Invoked when a new session is required but no launcher is wired. */
	onMissingLauncher: () => void;
}

/** Dispatch a formatted selection to the resolved agent target. Mirrors the
 *  DiffPane sibling's submit dispatch (useDiffCommentComposer.ts:168-194):
 *  existing terminal → writeInput; new session → onCreateNewAgentSession; no
 *  launcher → signal (toast) rather than drop. Returns an outcome instead of
 *  throwing so the caller can run its supersede guard / keep state for retry. */
export async function dispatchSelection({
	workspaceId,
	text,
	target,
	sendToTerminalAgent,
	onCreateNewAgentSession,
	onMissingLauncher,
}: DispatchSelectionArgs): Promise<DispatchOutcome> {
	// A null target (empty ladder — no live session and no config) or a
	// {kind:"new"} target both require launching a fresh session. Without a
	// wired launcher we signal rather than drop the selection (edge #3).
	if (target === null || target.kind === "new") {
		if (target === null || !onCreateNewAgentSession) {
			onMissingLauncher();
			return "no-launcher";
		}
		const result = await onCreateNewAgentSession({
			configId: target.configId,
			placement: target.placement,
			prompt: text,
		});
		return result ? "sent" : "failed";
	}

	try {
		await sendToTerminalAgent({
			workspaceId,
			terminalId: target.terminalId,
			text,
		});
		return "sent";
	} catch {
		// Toast already surfaced by useSendToTerminalAgent; keep state for retry.
		return "failed";
	}
}
