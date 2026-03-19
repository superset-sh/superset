import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";

interface WorktreeChoiceDialogProps {
	projectName: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onChoice: (enableWorktrees: boolean) => void;
}

export function WorktreeChoiceDialog({
	projectName,
	open,
	onOpenChange,
	onChoice,
}: WorktreeChoiceDialogProps) {
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent className="max-w-[420px] gap-0 p-0">
				<AlertDialogHeader className="px-4 pt-4 pb-3">
					<AlertDialogTitle className="font-medium">
						Enable worktrees for "{projectName}"?
					</AlertDialogTitle>
					<AlertDialogDescription asChild>
						<div className="text-muted-foreground space-y-1.5">
							<span className="block text-xs">
								<strong>With Worktrees</strong> — each workspace gets its own
								isolated copy of the repo. You can run multiple agents in
								parallel without conflicts.
							</span>
							<span className="block text-xs">
								<strong>Without Worktrees</strong> — work directly in the
								project folder. One workspace, no copies.
							</span>
						</div>
					</AlertDialogDescription>
				</AlertDialogHeader>

				<AlertDialogFooter className="px-4 pb-4 pt-2 flex-row justify-end gap-2">
					<Button
						variant="outline"
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={() => {
							onOpenChange(false);
							onChoice(false);
						}}
					>
						Without Worktrees
					</Button>
					<Button
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={() => {
							onOpenChange(false);
							onChoice(true);
						}}
					>
						With Worktrees
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
