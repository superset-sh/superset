import type { SendToTerminalAgentInput } from "renderer/hooks/host-service/useSendToTerminalAgent";
import type {
	AgentSessionPlacement,
	AgentTarget,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/DiffPane/components/AgentCommentComposer";

/** `sent` → delivered; `failed` → caller keeps state for retry (toast already
 *  shown); `no-launcher` → a new session was needed but none was wired. */
export type DispatchOutcome = "sent" | "failed" | "no-launcher";

interface DispatchSelectionArgs {
	workspaceId: string;
	/** Already-formatted, already-bounded prompt body. */
	text: string;
	/** Resolved target, or null when the ladder produced nothing. */
	target: AgentTarget | null;
	sendToTerminalAgent: (input: SendToTerminalAgentInput) => Promise<void>;
	onCreateNewAgentSession?: (input: {
		configId: string;
		placement: AgentSessionPlacement;
		prompt: string;
	}) => Promise<{ terminalId: string } | null>;
	/** Called when a new session is needed but no launcher is wired. */
	onMissingLauncher: () => void;
}

/** Send a formatted selection to the resolved target: existing terminal →
 *  writeInput; new/null target → onCreateNewAgentSession, or signal when no
 *  launcher is wired. Returns an outcome instead of throwing. */
export async function dispatchSelection({
	workspaceId,
	text,
	target,
	sendToTerminalAgent,
	onCreateNewAgentSession,
	onMissingLauncher,
}: DispatchSelectionArgs): Promise<DispatchOutcome> {
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
		return "failed";
	}
}
