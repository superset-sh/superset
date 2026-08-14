import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { useState } from "react";
import { GhAuthDialog } from "renderer/routes/_authenticated/onboarding/components/GhAuthDialog";
import type { GhCliGateReason } from "../../hooks/usePRFlowDispatch";

const GH_CLI_INSTALL_URL = "https://cli.github.com/";

interface GhCliGateDialogProps {
	reason: GhCliGateReason;
	/** Re-runs gh detection; the caller resumes the PR flow once it passes. */
	onRecheck: () => void;
	onDismiss: () => void;
}

/**
 * Pre-flight gate shown when "Create PR" is clicked but the GitHub CLI is
 * missing or signed out. Swaps to the embedded gh sign-in dialog (rather than
 * stacking on top of it) so only one dialog is on screen at a time.
 */
export function GhCliGateDialog({
	reason,
	onRecheck,
	onDismiss,
}: GhCliGateDialogProps) {
	const [signInOpen, setSignInOpen] = useState(false);

	if (signInOpen) {
		return (
			<GhAuthDialog
				open
				onOpenChange={(open) => {
					if (open) return;
					setSignInOpen(false);
					onRecheck();
				}}
				onExit={() => {
					setSignInOpen(false);
					onRecheck();
				}}
			/>
		);
	}

	const notInstalled = reason === "not-installed";

	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open) onDismiss();
			}}
		>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle className="select-text cursor-text">
						{notInstalled
							? "GitHub CLI isn't installed"
							: "GitHub CLI isn't signed in"}
					</DialogTitle>
					<DialogDescription className="select-text cursor-text">
						{notInstalled
							? "Creating a pull request uses the GitHub CLI (gh), which wasn't found on this machine. Install it, then check again to continue."
							: "Creating a pull request uses the GitHub CLI (gh), which isn't signed in to GitHub. Sign in to continue — your PR will pick up where it left off."}
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					{notInstalled ? (
						<>
							<Button
								variant="outline"
								onClick={() =>
									window.open(
										GH_CLI_INSTALL_URL,
										"_blank",
										"noopener,noreferrer",
									)
								}
							>
								Get GitHub CLI
							</Button>
							<Button onClick={onRecheck}>Check again</Button>
						</>
					) : (
						<Button onClick={() => setSignInOpen(true)}>
							Sign in to GitHub
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
