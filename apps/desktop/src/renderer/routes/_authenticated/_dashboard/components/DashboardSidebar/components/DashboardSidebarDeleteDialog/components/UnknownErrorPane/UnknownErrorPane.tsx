import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";

interface UnknownErrorPaneProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	message: string;
	/** Clears the error and returns to the default confirm pane. */
	onRetry: () => void;
}

/** Fallback for TRPC/network errors that aren't CONFLICT or TEARDOWN_FAILED. */
export function UnknownErrorPane({
	open,
	onOpenChange,
	message,
	onRetry,
}: UnknownErrorPaneProps) {
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent className="max-w-[380px] gap-0 p-0">
				<AlertDialogHeader className="px-4 pt-4 pb-2">
					<AlertDialogTitle className="font-medium">
						Delete failed
					</AlertDialogTitle>
					<AlertDialogDescription>{message}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter className="px-4 pb-4 pt-2 flex-row justify-end gap-2">
					<Button
						variant="ghost"
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={() => onOpenChange(false)}
					>
						Close
					</Button>
					<Button
						variant="secondary"
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={onRetry}
					>
						Try again
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
