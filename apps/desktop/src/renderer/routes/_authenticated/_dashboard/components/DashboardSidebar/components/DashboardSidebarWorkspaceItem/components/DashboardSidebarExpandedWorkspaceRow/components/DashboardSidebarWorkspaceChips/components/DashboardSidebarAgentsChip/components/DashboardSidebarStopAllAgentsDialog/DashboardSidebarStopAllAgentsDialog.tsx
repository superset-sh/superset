import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import { getStopAllAgentsConfirmCopy } from "../../utils/agentsChipCopy";

interface DashboardSidebarStopAllAgentsDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	agentCount: number;
	isPending: boolean;
	onConfirm: () => void;
}

/**
 * Confirm for stopping every agent in a workspace. Disposing a terminal
 * session can't be undone — the process is gone and its scrollback with it —
 * so this is a confirm rather than the undo toast used for reversible actions.
 *
 * Rendered as a sibling of the agents hover card, not inside it: the card
 * closes as soon as the pointer leaves the chip, which would unmount a dialog
 * nested in its content mid-confirm.
 */
export function DashboardSidebarStopAllAgentsDialog({
	open,
	onOpenChange,
	agentCount,
	isPending,
	onConfirm,
}: DashboardSidebarStopAllAgentsDialogProps) {
	const { title, description, confirmLabel } =
		getStopAllAgentsConfirmCopy(agentCount);

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent className="max-w-[340px] gap-3">
				<AlertDialogHeader>
					<AlertDialogTitle className="font-medium">{title}</AlertDialogTitle>
					<AlertDialogDescription>{description}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter className="flex-row justify-end gap-2">
					{/* Cancel first in the DOM so it takes the dialog's initial focus —
					    Enter must not fall through to the destructive action. */}
					<AlertDialogCancel asChild>
						<Button variant="ghost" size="sm" className="h-7 px-3 text-xs">
							Cancel
						</Button>
					</AlertDialogCancel>
					<Button
						variant="destructive"
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={onConfirm}
						disabled={isPending}
					>
						{confirmLabel}
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
