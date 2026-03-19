import { useWorktreeChoiceDialogStore } from "renderer/stores/worktree-choice-dialog";
import { WorktreeChoiceDialog } from "./WorktreeChoiceDialog";

export function ConnectedWorktreeChoiceDialog() {
	const { isOpen, projectName, onChoice, close } =
		useWorktreeChoiceDialogStore();

	return (
		<WorktreeChoiceDialog
			projectName={projectName}
			open={isOpen}
			onOpenChange={(open) => {
				if (!open) close();
			}}
			onChoice={async (enableWorktrees) => {
				try {
					await onChoice?.(enableWorktrees);
				} catch (error) {
					console.error("[WorktreeChoiceDialog] onChoice failed:", error);
				} finally {
					close();
				}
			}}
		/>
	);
}
