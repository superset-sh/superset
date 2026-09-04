import { Trans, useLingui } from "@lingui/react/macro";
import type { RendererContext } from "@superset/panes";
import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { workspaceTrpc } from "@superset/workspace-client";
import { History, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTerminalResumeCandidate } from "renderer/hooks/host-service/useTerminalResumeCandidate";
import type { ConnectionState } from "renderer/lib/terminal/terminal-runtime-registry";
import { terminalRuntimeRegistry } from "renderer/lib/terminal/terminal-runtime-registry";
import type {
	PaneViewerData,
	TerminalPaneData,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";

interface TerminalAgentAutoResumeProps {
	workspaceId: string;
	terminalId: string;
	/** Re-checks the candidate on transport transitions: the host marks the
	 * binding ended during the attach that cold-respawns a lost pty. */
	connectionState: ConnectionState;
	ctx: RendererContext<PaneViewerData>;
}

/**
 * Automatically restores an agent session whose terminal died without the
 * agent's own SessionEnd (killed daemon, laptop reboot, crashed pty). The
 * host's `terminalAgents.resume` claims the candidate atomically and
 * coalesces concurrent callers, so duplicate mounts, StrictMode re-effects,
 * and second windows all converge on the one resumed session; this component
 * then re-points the pane at it. Only a failed launch surfaces UI — a banner
 * with a manual retry.
 */
export function TerminalAgentAutoResume({
	workspaceId,
	terminalId,
	connectionState,
	ctx,
}: TerminalAgentAutoResumeProps) {
	const { t } = useLingui();
	const { candidate, invalidate } = useTerminalResumeCandidate(
		workspaceId,
		terminalId,
	);
	const [failed, setFailed] = useState(false);
	const [dismissed, setDismissed] = useState(false);
	const attemptedSessionRef = useRef<string | null>(null);

	// A cold-respawned shell can host a fresh agent session in this same
	// terminal and die again — failure/dismissal state belongs to one
	// candidate session, not the pane's lifetime.
	const candidateSessionId = candidate?.agentSessionId;
	const seenSessionRef = useRef(candidateSessionId);
	useEffect(() => {
		if (!candidateSessionId || seenSessionRef.current === candidateSessionId)
			return;
		seenSessionRef.current = candidateSessionId;
		setFailed(false);
		setDismissed(false);
	}, [candidateSessionId]);

	// The host marks the binding ended during the attach that cold-respawns a
	// lost pty, so every transport transition is a reason to re-check.
	useEffect(() => {
		void connectionState;
		invalidate();
	}, [connectionState, invalidate]);

	const { mutateAsync: resumeAsync } =
		workspaceTrpc.terminalAgents.resume.useMutation();

	const shouldResume = Boolean(candidate?.resumeSupported) && !failed;
	useEffect(() => {
		if (!shouldResume || !candidateSessionId) return;
		// One attempt per candidate session: remounts and re-renders must not
		// re-fire (the host claim makes repeats harmless, just wasteful).
		if (attemptedSessionRef.current === candidateSessionId) return;
		attemptedSessionRef.current = candidateSessionId;

		void (async () => {
			try {
				const result = await resumeAsync({ workspaceId, terminalId });
				if (!result.resumed) {
					// Another caller consumed the candidate (or it vanished).
					// Lifecycle events are fire-and-forget, so refetch explicitly
					// rather than leaving the pill up on a stale candidate.
					invalidate();
					return;
				}
				const state = ctx.store.getState();
				state.setPaneData({
					paneId: ctx.pane.id,
					data: { terminalId: result.terminalId } satisfies TerminalPaneData,
				});
				state.setPaneTitleOverride({
					tabId: ctx.tab.id,
					paneId: ctx.pane.id,
					titleOverride: result.label,
				});
				terminalRuntimeRegistry.dispose(terminalId);
			} catch (error) {
				// The banner only says "Failed to resume" — keep the detail
				// reachable for support via the console/main.log mirror, which
				// serializes plain fields but drops Error's non-enumerable ones.
				console.error("[terminal-agents] auto-resume failed", {
					workspaceId,
					terminalId,
					message: error instanceof Error ? error.message : String(error),
					stack: error instanceof Error ? error.stack : undefined,
				});
				// A late failure from a superseded candidate must not mark the
				// current one failed.
				if (attemptedSessionRef.current === candidateSessionId) {
					setFailed(true);
				}
			}
		})();
	}, [
		shouldResume,
		candidateSessionId,
		resumeAsync,
		invalidate,
		workspaceId,
		terminalId,
		ctx,
	]);

	if (!candidate?.resumeSupported || dismissed) return null;

	return (
		<div className="absolute top-2 left-1/2 z-20 -translate-x-1/2">
			<div
				className={cn(
					"flex items-center gap-2 rounded-md border border-border bg-background/95 py-1 pl-2.5 shadow-md",
					failed ? "pr-1" : "pr-2.5",
				)}
			>
				<History
					aria-hidden="true"
					className="size-3.5 shrink-0 text-muted-foreground"
				/>
				<output
					aria-live="polite"
					className="whitespace-nowrap text-xs text-muted-foreground"
				>
					{failed ? (
						<Trans>Failed to resume {candidate.agentLabel}</Trans>
					) : (
						<Trans>Resuming {candidate.agentLabel}…</Trans>
					)}
				</output>
				{failed && (
					<>
						<Button
							size="sm"
							className="h-6 px-2 text-xs"
							onClick={() => {
								setFailed(false);
								attemptedSessionRef.current = null;
							}}
						>
							<Trans>Retry</Trans>
						</Button>
						<Button
							variant="ghost"
							size="icon"
							className="size-6"
							aria-label={t({
								message: "Dismiss resume prompt",
							})}
							onClick={() => setDismissed(true)}
						>
							<X className="size-3.5" />
						</Button>
					</>
				)}
			</div>
		</div>
	);
}
