import { toast } from "@superset/ui/sonner";
import { useCallback, useMemo, useRef, useState } from "react";
import { dispatchSelection } from "renderer/hooks/host-service/dispatchSelection";
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
import { isStillCurrent } from "./isStillCurrent";
import { resolveSendOutcome } from "./resolveSendOutcome";

/** Shown when a valid selection has nowhere to go: no live agent and no config. */
const NO_AGENT_MESSAGE =
	"No agent available to send to. Start an agent in this workspace, or add one in Settings → Agents.";

interface UseSendSelectionToAgentArgs {
	workspaceId: string;
	filePath: string;
	/** Stable getter for the live adapter. */
	getEditor: () => CodeEditorAdapter | null | undefined;
	/** New-terminal-session launcher, injected by the host. */
	onCreateNewAgentSession?: (input: {
		configId: string;
		placement: AgentSessionPlacement;
		prompt: string;
	}) => Promise<{ terminalId: string } | null>;
}

interface SendSelectionInput {
	/** Optional user instruction; when absent a default verb is used. */
	instruction?: string;
	/** Optional target override. When omitted, the hook resolves the default. */
	target?: AgentTarget;
}

interface UseSendSelectionToAgentResult {
	/** Advisory UI hint: is there a non-empty selection right now. send()
	 *  re-captures authoritatively. */
	canSend: boolean;
	send: (input?: SendSelectionInput) => Promise<void>;
	/** Re-evaluate canSend; the host calls this on selection changes. */
	refreshCanSend: () => void;
	isPending: boolean;
}

/** Capture → bound → format → dispatch a file-viewer selection. */
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

	const [canSend, setCanSend] = useState(false);
	const refreshCanSend = useCallback(() => {
		setCanSend(getEditor()?.getSelection(filePath) != null);
	}, [getEditor, filePath]);

	// Supersede guard: a slow send must not act on a selection the user has
	// since changed.
	const dispatchTokenRef = useRef(0);

	const send = useCallback(
		async (input?: SendSelectionInput) => {
			const region = getEditor()?.getSelection(filePath);
			const target = input?.target ?? resolved;

			// A sendable selection with no agent and no config gets a clear toast,
			// never a silent drop.
			const decision = resolveSendOutcome(region, target);
			if (decision === "no-selection") return;
			if (decision === "no-agent") {
				toast.error(NO_AGENT_MESSAGE);
				return;
			}

			// resolveSendOutcome already narrowed region; TS can't see it here.
			const resolvedRegion = region as NonNullable<typeof region>;

			const token = ++dispatchTokenRef.current;
			const text = buildSelectionPrompt(resolvedRegion, input?.instruction);

			const outcome = await dispatchSelection({
				workspaceId,
				text,
				target,
				sendToTerminalAgent,
				onCreateNewAgentSession,
				onMissingLauncher: () =>
					toast.error("Couldn't start a new agent session"),
			});

			// Only run cleanup if a newer send hasn't superseded this one.
			if (!isStillCurrent(token, dispatchTokenRef.current)) return;
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
