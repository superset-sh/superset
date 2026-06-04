import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { GhAuthTerminal } from "./GhAuthTerminal";

interface GhAuthDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Fired when the gh process exits so the caller can re-check auth status. */
	onExit: () => void;
}

export function GhAuthDialog({
	open,
	onOpenChange,
	onExit,
}: GhAuthDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-[752px] gap-4">
				<DialogHeader>
					<DialogTitle>Sign in to GitHub CLI</DialogTitle>
					<DialogDescription>
						Follow the prompts below. Press Enter to open your browser,
						authorize the device code, and this window will update once you're
						signed in.
					</DialogDescription>
				</DialogHeader>
				<div className="h-[240px] w-full overflow-hidden rounded-md bg-[#151110] p-2">
					{open && <GhAuthTerminal onExit={onExit} />}
				</div>
			</DialogContent>
		</Dialog>
	);
}
