import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";

/**
 * Shown when the chat cannot be used: the agent session had no transcript to
 * resume, or its process is gone (a host restart outlives the stored session,
 * which still reads "idle"). Both leave a pane that looks fine and fails on
 * send, so say what happened and offer the way out.
 *
 * A stopped chat resumes itself, so reaching here means resuming was not on
 * offer: no transcript to load, or no agent session left to load it from.
 */
export function AcpRecovery({
	detail,
	onResume,
	onStartNew,
	reason,
}: {
	reason: "no-transcript" | "stopped" | "in-terminal";
	detail?: string | undefined;
	onResume?: () => void;
	onStartNew: () => void;
}) {
	return (
		// w-full because the pane lays its children out in a row: without it this
		// sizes to its content and hugs the left edge.
		<div className="flex h-full w-full flex-col items-center justify-center gap-3 p-8 text-center">
			<p className="max-w-sm text-muted-foreground text-sm">
				{reason === "in-terminal" ? (
					<Trans>
						This chat stopped because the conversation continued in a terminal.
					</Trans>
				) : reason === "no-transcript" ? (
					<Trans>
						That agent session has no conversation to open yet — it was started
						but never prompted.
					</Trans>
				) : (
					<Trans>This chat was stopped.</Trans>
				)}
			</p>
			{detail && (
				<p className="max-w-lg font-mono text-[11px] text-muted-foreground/60">
					{detail}
				</p>
			)}
			<div className="flex gap-2">
				{onResume && (
					<Button onClick={onResume} size="sm">
						<Trans>Resume</Trans>
					</Button>
				)}
				<Button onClick={onStartNew} size="sm" variant="secondary">
					<Trans>Start a new chat</Trans>
				</Button>
			</div>
		</div>
	);
}
