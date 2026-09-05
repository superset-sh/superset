import { Plural, Trans } from "@lingui/react/macro";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	EnterEnabledAlertDialogContent,
} from "@superset/ui/alert-dialog";
import { useRef } from "react";
import type { ManagedAgent } from "../../utils/visibleQuotaAgents";

export interface RestartSessionsPrompt {
	/** Whose sessions these are; the confirmation toast words itself per agent. */
	agent: ManagedAgent;
	/** "Claude Code" / "Codex". */
	providerLabel: string;
	/** The account just made active, as shown on its card. */
	accountLabel: string;
	/** Running sessions the switch could not reach. */
	count: number;
}

interface RestartSessionsDialogProps {
	/** The pending notice; null keeps the dialog closed. */
	prompt: RestartSessionsPrompt | null;
	/** Escape/overlay/"OK" — the switch stands, nothing else happens. */
	onDismiss: () => void;
}

/**
 * Post-switch notice from the Usage tab for the sessions a switch cannot
 * move: their agent configuration exports its own `CLAUDE_CONFIG_DIR` /
 * `CODEX_HOME`, and that env wins over the host default at launch (see
 * `resolveAgentAccountDir`), so they stay on their own account however they
 * are relaunched. There is nothing to offer but the fact — a restart would
 * resume them on the very same account — so this only informs and dismisses.
 */
export function RestartSessionsDialog({
	prompt,
	onDismiss,
}: RestartSessionsDialogProps) {
	// Radix animates the dialog out after `prompt` clears; keep the last
	// prompt so the exit frames don't collapse to "0 running agents".
	const lastPromptRef = useRef(prompt);
	if (prompt !== null) lastPromptRef.current = prompt;
	const shown = prompt ?? lastPromptRef.current;
	const providerLabel = shown?.providerLabel ?? "";
	return (
		<AlertDialog
			open={prompt !== null}
			onOpenChange={(open) => {
				if (!open) onDismiss();
			}}
		>
			<EnterEnabledAlertDialogContent className="max-w-[400px] gap-0 p-0">
				<AlertDialogHeader className="px-4 pt-4 pb-2">
					<AlertDialogTitle className="font-medium">
						<Trans>
							Some {providerLabel} sessions stay on their own account
						</Trans>
					</AlertDialogTitle>
					<AlertDialogDescription>
						{/* Plain-string plural branches: JSX branches extract as opaque
						    placeholders, hiding the sentence from translators. */}
						<Plural
							value={shown?.count ?? 0}
							one="A running agent is pinned to its own config dir by its agent configuration, so it keeps the account signed in there."
							other="# running agents are pinned to their own config dirs by their agent configuration, so they keep the accounts signed in there."
						/>
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter className="flex-row justify-end gap-2 px-4 pt-2 pb-4">
					{/* Closing the dialog is what reports the dismissal, so this
					    carries no onClick of its own: Radix closes on click and the
					    single `onOpenChange` path fires once for button, Escape and
					    overlay alike. */}
					<AlertDialogAction size="sm" className="h-7 px-3 text-xs">
						<Trans>OK</Trans>
					</AlertDialogAction>
				</AlertDialogFooter>
			</EnterEnabledAlertDialogContent>
		</AlertDialog>
	);
}
