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
import { useEffect, useRef } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
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
	const preSelectedProjectId = usePreSelectedProjectId();

	// Prevents AgentSelect from flashing "No agent" while presets load after refresh.
	electronTrpc.settings.getAgentPresets.useQuery();

	return (
		<DashboardNewWorkspaceDraftProvider onClose={closeModal}>
			<PromptInputProvider>
				<PromptInputResetSync />
				<Dialog open={isOpen} onOpenChange={(open) => !open && closeModal()}>
					<DialogHeader className="sr-only">
						<DialogTitle>New Workspace</DialogTitle>
						<DialogDescription>Create a new workspace</DialogDescription>
					</DialogHeader>
					<DialogContent
						showCloseButton={false}
						onFocusOutside={(e) => e.preventDefault()}
						className="bg-popover text-popover-foreground sm:max-w-[560px] max-h-[min(70vh,600px)] !top-[calc(50%-min(35vh,300px))] !-translate-y-0 flex flex-col overflow-hidden p-0"
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
