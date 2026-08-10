import type { RendererContext } from "@superset/panes";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { History, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTerminalResumeCandidate } from "renderer/hooks/host-service/useTerminalResumeCandidate";
import type { ConnectionState } from "renderer/lib/terminal/terminal-runtime-registry";
import { terminalRuntimeRegistry } from "renderer/lib/terminal/terminal-runtime-registry";
import type {
	PaneViewerData,
	TerminalPaneData,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";

interface TerminalAgentResumeBannerProps {
	workspaceId: string;
	terminalId: string;
	/** Re-checks the candidate on transport transitions: the host marks the
	 * binding ended during the attach that cold-respawns a lost pty. */
	connectionState: ConnectionState;
	ctx: RendererContext<PaneViewerData>;
}

/**
 * Offers to restore an agent session whose terminal died without the agent's
 * own SessionEnd (killed daemon, laptop reboot, crashed pty). Resuming runs
 * the agent's resume command (e.g. `claude --resume <id>`) in a fresh
 * terminal and re-points this pane at it.
 */
export function TerminalAgentResumeBanner({
	workspaceId,
	terminalId,
	connectionState,
	ctx,
}: TerminalAgentResumeBannerProps) {
	const { candidate, invalidate } = useTerminalResumeCandidate(
		workspaceId,
		terminalId,
	);
	const [dismissed, setDismissed] = useState(false);

	// The host marks the binding ended during the attach that cold-respawns a
	// lost pty, so every transport transition is a reason to re-check.
	useEffect(() => {
		void connectionState;
		invalidate();
	}, [connectionState, invalidate]);

	const runAgent = workspaceTrpc.agents.run.useMutation();
	// The replaced session is dead (or a respawned empty shell nobody asked
	// for) — drop it silently once the pane points elsewhere.
	const killReplacedSession = workspaceTrpc.terminal.killSession.useMutation({
		onError: (error) => {
			console.warn("Failed to kill replaced terminal session", {
				workspaceId,
				terminalId,
				error,
			});
		},
	});

	if (!candidate?.resumeSupported || dismissed) return null;

	const handleResume = async () => {
		try {
			const result = await runAgent.mutateAsync({
				workspaceId,
				agent: candidate.agent,
				prompt: "",
				resumeSessionId: candidate.agentSessionId,
			});
			if (result.kind !== "terminal") {
				toast.error("Selected agent isn't a terminal agent");
				return;
			}
			const state = ctx.store.getState();
			state.setPaneData({
				paneId: ctx.pane.id,
				data: { terminalId: result.sessionId } satisfies TerminalPaneData,
			});
			state.setPaneTitleOverride({
				tabId: ctx.tab.id,
				paneId: ctx.pane.id,
				titleOverride: result.label,
			});
			killReplacedSession.mutate({ workspaceId, terminalId });
			terminalRuntimeRegistry.dispose(terminalId);
		} catch (error) {
			toast.error("Failed to resume agent session", {
				description: error instanceof Error ? error.message : undefined,
			});
		}
	};

	return (
		<div className="absolute top-2 left-1/2 z-20 -translate-x-1/2">
			<div className="flex items-center gap-2 rounded-md border border-border bg-background/95 py-1 pl-2.5 pr-1 shadow-md">
				<History
					aria-hidden="true"
					className="size-3.5 shrink-0 text-muted-foreground"
				/>
				<span className="select-text cursor-text whitespace-nowrap text-xs text-muted-foreground">
					{candidate.agentLabel} was interrupted
				</span>
				<Button
					size="sm"
					className="h-6 px-2 text-xs"
					onClick={() => void handleResume()}
					disabled={runAgent.isPending}
				>
					{runAgent.isPending ? "Resuming…" : "Resume"}
				</Button>
				<Button
					variant="ghost"
					size="icon"
					className="size-6"
					aria-label="Dismiss resume prompt"
					onClick={() => setDismissed(true)}
				>
					<X className="size-3.5" />
				</Button>
			</div>
		</div>
	);
}
