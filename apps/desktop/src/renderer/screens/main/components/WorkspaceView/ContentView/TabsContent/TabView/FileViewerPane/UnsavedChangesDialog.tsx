import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	EnterEnabledAlertDialogContent,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import { LuLoader } from "react-icons/lu";

interface UnsavedChangesDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSave: () => void;
	onDiscard: () => void;
	isSaving?: boolean;
	title?: string;
	description?: string;
	discardLabel?: string;
	saveLabel?: string;
}

export function UnsavedChangesDialog({
	open,
	onOpenChange,
	onSave,
	onDiscard,
	isSaving = false,
	title = "Unsaved Changes",
	description = "You have unsaved changes. What would you like to do?",
	discardLabel = "Discard & Continue",
	saveLabel = "Save & Continue",
}: UnsavedChangesDialogProps) {
	const handleSaveAndSwitch = () => {
		onSave();
	};

	const handleDiscardAndSwitch = () => {
		onDiscard();
	};

	return (
		<AlertDialog open={open} onOpenChange={isSaving ? undefined : onOpenChange}>
			<EnterEnabledAlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					<AlertDialogDescription>{description}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={isSaving}>Cancel</AlertDialogCancel>
					<AlertDialogAction
						variant="outline"
						onClick={handleDiscardAndSwitch}
						disabled={isSaving}
						className="border-destructive/50 text-destructive hover:bg-destructive/10"
					>
						{discardLabel}
					</AlertDialogAction>
					<Button onClick={handleSaveAndSwitch} disabled={isSaving}>
						{isSaving ? (
							<>
								<LuLoader className="mr-2 h-4 w-4 animate-spin" />
								Saving...
							</>
						) : (
							saveLabel
						)}
					</Button>
				</AlertDialogFooter>
			</EnterEnabledAlertDialogContent>
		</AlertDialog>
	);
}
