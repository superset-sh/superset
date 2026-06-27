import {
	PromptInputProvider,
	usePromptInputController,
} from "@superset/ui/ai-elements/prompt-input";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { useCallback, useEffect, useRef } from "react";
import { useNewWorkspaceDraftStore } from "renderer/stores/new-workspace-draft";
import {
	useCloseNewWorkspaceModal,
	useNewWorkspaceModalOpen,
	usePreSelectedProjectId,
} from "renderer/stores/new-workspace-modal";
import { DashboardNewWorkspaceModalContent } from "./components/DashboardNewWorkspaceModalContent";
import {
	DashboardNewWorkspaceDraftProvider,
	useDashboardNewWorkspaceDraft,
} from "./DashboardNewWorkspaceDraftContext";

/** Clears the PromptInputProvider text & attachments when the draft resets. */
function PromptInputResetSync() {
	const { resetKey } = useDashboardNewWorkspaceDraft();
	const { textInput, attachments } = usePromptInputController();
	const prevResetKeyRef = useRef(resetKey);

	useEffect(() => {
		if (resetKey !== prevResetKeyRef.current) {
			prevResetKeyRef.current = resetKey;
			textInput.clear();
			attachments.clear();
		}
	}, [resetKey, textInput.clear, attachments.clear]);

	return null;
}

export function DashboardNewWorkspaceModal() {
	const isOpen = useNewWorkspaceModalOpen();
	const closeModal = useCloseNewWorkspaceModal();
	const dismissDraft = useNewWorkspaceDraftStore((s) => s.dismissDraft);
	const preSelectedProjectId = usePreSelectedProjectId();

	// Dismissing without creating (Esc / click outside) must drop a
	// Configure-seeded prompt so it doesn't reappear on the next open, while
	// leaving a user-typed draft intact.
	const handleDismiss = useCallback(() => {
		dismissDraft();
		closeModal();
	}, [dismissDraft, closeModal]);

	return (
		<DashboardNewWorkspaceDraftProvider onClose={closeModal}>
			<PromptInputProvider>
				<PromptInputResetSync />
				<Dialog
					modal
					open={isOpen}
					onOpenChange={(open) => !open && handleDismiss()}
				>
					<DialogHeader className="sr-only">
						<DialogTitle>New Workspace</DialogTitle>
						<DialogDescription>Create a new workspace</DialogDescription>
					</DialogHeader>
					<DialogContent
						showCloseButton={false}
						onFocusOutside={(e) => e.preventDefault()}
						className="bg-popover text-popover-foreground sm:max-w-[680px] flex flex-col overflow-hidden p-0"
					>
						<DashboardNewWorkspaceModalContent
							isOpen={isOpen}
							preSelectedProjectId={preSelectedProjectId}
						/>
					</DialogContent>
				</Dialog>
			</PromptInputProvider>
		</DashboardNewWorkspaceDraftProvider>
	);
}
