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
import { isStillCurrent } from "./isStillCurrent";
import { resolveSendOutcome } from "./resolveSendOutcome";

/** Shown when a valid selection has nowhere to go: no live terminal agent AND
 *  no agent config (the target ladder yields null). Actionable, not a generic
 *  failure — parity-plus over the diff composer, which surfaces a misleading
 *  "couldn't start a new session" here even though nothing could be launched. */
const NO_AGENT_MESSAGE =
	"No agent available to send to. Start an agent in this workspace, or add one in Settings → Agents.";

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
 *  selection. Owns all five edge cases (#1 inert empty, #2 bound large,
 *  #3 no-session → new, #4 unresolvable path → refuse-only in PR1, #5 supersede
 *  guard + toast-on-error keep-for-retry). Mirrors useDiffCommentComposer's
 *  submit/dispatch/guard shape; the default target ladder is reused verbatim
 *  from the DiffPane sibling. */
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
			// Capture is authoritative. A null region is REFUSED (no-op): it covers
			// edge #1 (empty/whitespace selection) AND edge #4 (unresolvable path).
			//
			// Edge #4 — refuse-only in PR1, by design. `getSelection(path)` takes a
			// required non-optional `path`, and this v2 CodeView host always mounts
			// against a real on-disk `ViewProps.filePath`, so a non-empty selection
			// here ALWAYS has a resolvable path + finite lines. The "real selection,
			// no on-disk path" text-only case only arises in a host with NO
			// CodeMirror adapter (diff/search/rendered-preview) — none exist in PR1,
			// where the affordance simply is not mounted. The text-only fallback is
			// therefore unreachable here and deferred to PR2 hosts. This refusal also
			// structurally guarantees the formatter is never fed undefined/NaN.
			const region = getEditor()?.getSelection(filePath);
			const target = input?.target ?? resolved;

			// Classify the request before dispatching. `no-selection` is the inert
			// refuse gate (edge #1 empty + edge #4 unresolvable). `no-agent` is the
			// empty-ladder case (no live terminal agent AND no agent config): there
			// is a sendable selection but nowhere to send it — surface a clear,
			// actionable toast rather than dropping the selection or showing the
			// misleading "couldn't start a new session" error. Never a silent drop.
			const decision = resolveSendOutcome(region, target);
			if (decision === "no-selection") return;
			if (decision === "no-agent") {
				toast.error(NO_AGENT_MESSAGE);
				return;
			}

			// resolveSendOutcome already ran shouldRefuseSelection, but TS can't
			// infer the narrowing across that boundary, so assert the region here.
			const resolvedRegion = region as NonNullable<typeof region>;

			const token = ++dispatchTokenRef.current;
			const { text } = buildSelectionPrompt(resolvedRegion, input?.instruction);

			const outcome = await dispatchSelection({
				workspaceId,
				text,
				target,
				sendToTerminalAgent,
				onCreateNewAgentSession,
				onMissingLauncher: () =>
					toast.error("Couldn't start a new agent session"),
			});

			// Supersede guard (edge #5): only run post-success cleanup if this
			// dispatch is still the current one (a newer send would have bumped
			// the ref). Extracted to isStillCurrent so the stale-token branch is
			// unit-tested without a renderHook harness.
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
