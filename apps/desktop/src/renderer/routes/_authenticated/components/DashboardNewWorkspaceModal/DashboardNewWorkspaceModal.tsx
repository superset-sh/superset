import { Trans } from "@lingui/react/macro";
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
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { newWorkspaceAttachmentsStore } from "renderer/stores/new-workspace-attachments";
import {
	useCloseNewWorkspaceModal,
	useNewWorkspaceModalOpen,
	usePreSelectedProjectId,
	usePreSelectedSession,
} from "renderer/stores/new-workspace-modal";
import { DashboardNewWorkspaceModalContent } from "./components/DashboardNewWorkspaceModalContent";
import {
	DashboardNewWorkspaceDraftProvider,
	useDashboardNewWorkspaceDraft,
} from "./DashboardNewWorkspaceDraftContext";
import { useNewWorkspaceScreenVariant } from "./hooks/useNewWorkspaceScreenVariant";

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
	const preSelectedProjectId = usePreSelectedProjectId();
	const preSelectedSession = usePreSelectedSession();
	const navigate = useNavigate();
	const variant = useNewWorkspaceScreenVariant(isOpen);
	const isScreen = variant === "test";

	// Test arm: the create surface is a page, not a modal. Store opens (the
	// "+" button, hotkey, onboarding hand-off) redirect to the route instead.
	useEffect(() => {
		if (!isScreen || !isOpen) return;
		closeModal();
		void navigate({
			to: "/new-workspace",
			search: preSelectedSession
				? { session: true }
				: preSelectedProjectId
					? { projectId: preSelectedProjectId }
					: undefined,
		});
	}, [
		isScreen,
		isOpen,
		closeModal,
		navigate,
		preSelectedProjectId,
		preSelectedSession,
	]);

	if (isOpen && variant === null) return null;
	if (isScreen) return null;

	return (
		<DashboardNewWorkspaceDraftProvider onClose={closeModal}>
			<PromptInputProvider attachmentsStore={newWorkspaceAttachmentsStore}>
				<PromptInputResetSync />
				<Dialog
					modal
					open={isOpen}
					onOpenChange={(open) => !open && closeModal()}
				>
					<DialogHeader className="sr-only">
						<DialogTitle>
							<Trans>New Workspace</Trans>
						</DialogTitle>
						<DialogDescription>
							<Trans>Create a new workspace</Trans>
						</DialogDescription>
					</DialogHeader>
					<DialogContent
						showCloseButton={false}
						onFocusOutside={(e) => e.preventDefault()}
						className="bg-popover text-popover-foreground sm:max-w-[680px] flex flex-col overflow-hidden p-0"
					>
						<DashboardNewWorkspaceModalContent
							isOpen={isOpen}
							preSelectedProjectId={preSelectedProjectId}
							preSelectedSession={preSelectedSession}
						/>
					</DialogContent>
				</Dialog>
			</PromptInputProvider>
		</DashboardNewWorkspaceDraftProvider>
	);
}
