import { Plural, Trans } from "@lingui/react/macro";
import {
	AlertDialog,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	EnterEnabledAlertDialogContent,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import { useRef } from "react";

export interface RestartSessionsPrompt {
	agent: "claude" | "codex";
	/** "Claude Code" / "Codex". */
	providerLabel: string;
	/** The account just made default, as shown on its card. */
	accountLabel: string;
	/** Running agent sessions the restart would relaunch. */
	count: number;
}

interface RestartSessionsDialogProps {
	/** The pending ask; null keeps the dialog closed. */
	prompt: RestartSessionsPrompt | null;
	/** Escape/overlay/"Not now" — the switch stands, nothing restarts. */
	onDecline: () => void;
	onConfirm: () => void;
}

/**
 * Post-switch ask from the Usage tab: running agents keep the previous
 * account until relaunched, so offer to restart them now. Confirming kills
 * each session crash-style and auto-resume brings it back with the same
 * conversation on the new account, so the confirm button is deliberately
 * not styled destructive.
 */
export function RestartSessionsDialog({
	prompt,
	onDecline,
	onConfirm,
}: RestartSessionsDialogProps) {
	// Radix animates the dialog out after `prompt` clears; keep the last
	// prompt so the exit frames don't collapse to "0 running agents".
	const lastPromptRef = useRef(prompt);
	if (prompt !== null) lastPromptRef.current = prompt;
	const shown = prompt ?? lastPromptRef.current;
	const providerLabel = shown?.providerLabel ?? "";
	const accountLabel = shown?.accountLabel ?? "";
	return (
		<AlertDialog
			open={prompt !== null}
			onOpenChange={(open) => {
				if (!open) onDecline();
			}}
		>
			<EnterEnabledAlertDialogContent className="max-w-[400px] gap-0 p-0">
				<AlertDialogHeader className="px-4 pt-4 pb-2">
					<AlertDialogTitle className="font-medium">
						<Trans>Restart running {providerLabel} agents?</Trans>
					</AlertDialogTitle>
					<AlertDialogDescription>
						{/* Plain-string plural branches: JSX branches extract as opaque
						    placeholders, hiding the sentence from translators. */}
						<Plural
							value={shown?.count ?? 0}
							one="A running agent still uses the previous account — the switch only reaches new launches."
							other="# running agents still use the previous account — the switch only reaches new launches."
						/>{" "}
						<Trans>
							Restart now to move them to {accountLabel}; each session picks its
							conversation back up where it left off.
						</Trans>
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter className="flex-row justify-end gap-2 px-4 pt-2 pb-4">
					<Button
						variant="ghost"
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={onDecline}
					>
						<Trans>Not now</Trans>
					</Button>
					<Button size="sm" className="h-7 px-3 text-xs" onClick={onConfirm}>
						<Trans>Restart and resume</Trans>
					</Button>
				</AlertDialogFooter>
			</EnterEnabledAlertDialogContent>
		</AlertDialog>
	);
}
