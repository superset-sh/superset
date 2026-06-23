import { toast } from "@superset/ui/sonner";
import { useCallback, useMemo, useRef, useState } from "react";
import { useSendToTerminalAgent } from "renderer/hooks/host-service/useSendToTerminalAgent";
import { useTerminalAgentBindings } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";
import type {
	AgentSessionPlacement,
	AgentTarget,
} from "../../../../../../../../DiffPane/components/AgentCommentComposer";
import { useDiffCommentTarget } from "../../../../../../../../DiffPane/components/AgentCommentComposer/hooks/useDiffCommentTarget";
import type { CodeEditorAdapter } from "../../CodeEditorAdapter";
import { buildSelectionPrompt } from "./buildSelectionPrompt";
import { dispatchSelection } from "./dispatchSelection";

interface UseSendSelectionToAgentArgs {
	workspaceId: string;
	filePath: string;
	/** Stable getter for the live adapter (mirrors useEditorActions' getEditor). */
	getEditor: () => CodeEditorAdapter | null | undefined;
	/** New-terminal-session launcher — injected, mirrors the sibling's
	 *  onCreateNewAgentSession (usePaneRegistry.createNewAgentSession). */
	onCreateNewAgentSession?: (input: {
		configId: string;
		placement: AgentSessionPlacement;
		prompt: string;
	}) => Promise<{ terminalId: string } | null>;
}

interface SendSelectionInput {
	/** Optional user instruction; when absent a default verb is used. */
	instruction?: string;
	/** Optional target OVERRIDE. When omitted, the hook resolves the default
	 *  target = the active/open agent, else a new session. */
	target?: AgentTarget;
}

interface UseSendSelectionToAgentResult {
	/** True iff getEditor()?.getSelection(filePath) is non-null right now.
	 *  ADVISORY UI hint only — send() re-captures and that capture is
	 *  authoritative. */
	canSend: boolean;
	send: (input?: SendSelectionInput) => Promise<void>;
	/** Re-evaluate canSend. The host calls this on editor selection changes so
	 *  the affordance enables/disables in lockstep with the highlight. */
	refreshCanSend: () => void;
	isPending: boolean;
}

/** Orchestrates capture → bound → format → dispatch for a file-viewer
 *  selection. Owns four of the five edge cases (#1 inert empty, #2 bound large,
 *  #3 no-session → new, #5 supersede guard + toast-on-error keep-for-retry).
 *  Mirrors useDiffCommentComposer's submit/dispatch/guard shape; the default
 *  target ladder is reused verbatim from the DiffPane sibling. */
export function useSendSelectionToAgent({
	workspaceId,
	filePath,
	getEditor,
	onCreateNewAgentSession,
}: UseSendSelectionToAgentArgs): UseSendSelectionToAgentResult {
	const { send: sendToTerminalAgent, isPending } = useSendToTerminalAgent();

	const bindings = useTerminalAgentBindings(workspaceId);
	const sessions = useMemo(
		() =>
			Array.from(bindings.values()).sort(
				(a, b) => b.lastEventAt - a.lastEventAt,
			),
		[bindings],
	);
	const hostUrl = useWorkspaceHostUrl(workspaceId);
	const { data: configs = [] } = useV2AgentConfigs(hostUrl);
	const { resolved } = useDiffCommentTarget({ sessions, configs });

	// canSend is advisory: it tracks whether there is a non-empty selection right
	// now so the affordance can disable. send() re-captures authoritatively.
	const [canSend, setCanSend] = useState(false);
	const refreshCanSend = useCallback(() => {
		setCanSend(getEditor()?.getSelection(filePath) != null);
	}, [getEditor, filePath]);

	// Supersede guard (edge #5): a token captured at dispatch time. A slow send
	// must not clear/act on a selection the user has since changed.
	const dispatchTokenRef = useRef(0);

	const send = useCallback(
		async (input?: SendSelectionInput) => {
			const region = getEditor()?.getSelection(filePath);
			if (!region) return; // edge #1 — inert, never formats or dispatches

			const token = ++dispatchTokenRef.current;
			const { text } = buildSelectionPrompt(region, input?.instruction);
			const target = input?.target ?? resolved;

			const outcome = await dispatchSelection({
				workspaceId,
				text,
				target,
				sendToTerminalAgent,
				onCreateNewAgentSession,
				onMissingLauncher: () =>
					toast.error("Couldn't start a new agent session"),
			});

			// Only react if this dispatch is still the current one.
			if (dispatchTokenRef.current !== token) return;
			if (outcome === "sent") refreshCanSend();
		},
		[
			getEditor,
			filePath,
			resolved,
			workspaceId,
			sendToTerminalAgent,
			onCreateNewAgentSession,
			refreshCanSend,
		],
	);

	return { canSend, send, refreshCanSend, isPending };
}
