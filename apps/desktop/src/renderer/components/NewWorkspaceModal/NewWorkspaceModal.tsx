import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { toast } from "@superset/ui/sonner";
import {
	PromptInputProvider,
	usePromptInputController,
} from "@superset/ui/ai-elements/prompt-input";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useOpenProject } from "renderer/react-query/projects";
import {
	useCloseNewWorkspaceModal,
	useNewWorkspaceModalOpen,
	usePreSelectedProjectId,
} from "renderer/stores/new-workspace-modal";
import { NewWorkspaceModalContent } from "./components/NewWorkspaceModalContent";
import {
	NewWorkspaceModalDraftProvider,
	useNewWorkspaceModalDraft,
} from "./NewWorkspaceModalDraftContext";

/** Clears the PromptInputProvider text & attachments when the draft resets. */
function PromptInputResetSync() {
	const { resetKey } = useNewWorkspaceModalDraft();
	const controller = usePromptInputController();
	const prevResetKeyRef = useRef(resetKey);

	useEffect(() => {
		if (resetKey !== prevResetKeyRef.current) {
			prevResetKeyRef.current = resetKey;
			controller.textInput.clear();
			controller.attachments.clear();
		}
	}, [resetKey, controller]);

	return null;
}

export function NewWorkspaceModal() {
	const isOpen = useNewWorkspaceModalOpen();
	const closeModal = useCloseNewWorkspaceModal();
	const navigate = useNavigate();
	const { openNew } = useOpenProject();
	const preSelectedProjectId = usePreSelectedProjectId();

	// Prefetch agent presets so the data is cached before the dialog opens.
	// This prevents the AgentSelect from briefly showing "No agent" while the
	// query loads after a page refresh.
	electronTrpc.settings.getAgentPresets.useQuery();

	const handleImportRepo = async () => {
		closeModal();
		try {
			await openNew();
		} catch (error) {
			toast.error("Failed to open project", {
				description:
					error instanceof Error ? error.message : "An unknown error occurred",
			});
		}
	};

	const handleNewProject = () => {
		closeModal();
		navigate({ to: "/new-project" });
	};

	return (
		<NewWorkspaceModalDraftProvider onClose={closeModal}>
			<PromptInputProvider>
				<PromptInputResetSync />
				<Dialog open={isOpen} onOpenChange={(open) => !open && closeModal()}>
					<DialogHeader className="sr-only">
						<DialogTitle>New Workspace</DialogTitle>
						<DialogDescription>Create a new workspace</DialogDescription>
					</DialogHeader>
					<DialogContent
						showCloseButton={false}
						className="bg-popover text-popover-foreground sm:max-w-[560px] max-h-[min(70vh,600px)] !top-[calc(50%-min(35vh,300px))] !-translate-y-0 flex flex-col overflow-hidden p-0"
					>
						<NewWorkspaceModalContent
							isOpen={isOpen}
							preSelectedProjectId={preSelectedProjectId}
							onImportRepo={handleImportRepo}
							onNewProject={handleNewProject}
						/>
					</DialogContent>
				</Dialog>
			</PromptInputProvider>
		</NewWorkspaceModalDraftProvider>
	);
}
