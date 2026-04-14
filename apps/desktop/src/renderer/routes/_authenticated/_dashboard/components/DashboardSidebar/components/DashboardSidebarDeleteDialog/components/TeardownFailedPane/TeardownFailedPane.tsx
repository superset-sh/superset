import type { TeardownFailureCause } from "@superset/host-service";
import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import stripAnsi from "strip-ansi";
import { formatTeardownReason } from "./formatTeardownReason";

interface TeardownFailedPaneProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	cause: TeardownFailureCause;
	/** Re-runs destroy with `force: true` — skips teardown entirely. */
	onForceDelete: () => void;
}

/** Shown when `.superset/teardown.sh` exited non-zero or timed out. */
export function TeardownFailedPane({
	open,
	onOpenChange,
	cause,
	onForceDelete,
}: TeardownFailedPaneProps) {
	const reason = formatTeardownReason(cause);
	// Strip ANSI so raw PTY bytes render readably in the <pre>.
	const cleanTail = stripAnsi(cause.outputTail ?? "");

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent className="max-w-[500px] gap-0 p-0">
				<AlertDialogHeader className="px-4 pt-4 pb-2">
					<AlertDialogTitle className="font-medium">{reason}</AlertDialogTitle>
					<AlertDialogDescription>
						Delete anyway will skip the teardown script entirely.
					</AlertDialogDescription>
				</AlertDialogHeader>
				{cleanTail && (
					<pre className="mx-4 mb-2 max-h-48 overflow-auto rounded border bg-muted px-2 py-1.5 text-[11px] leading-relaxed whitespace-pre-wrap font-mono">
						{cleanTail}
					</pre>
				)}
				<AlertDialogFooter className="px-4 pb-4 pt-2 flex-row justify-end gap-2">
					<Button
						variant="ghost"
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button
						variant="destructive"
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={onForceDelete}
					>
						Delete anyway
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
