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
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { newWorkspaceAttachmentsStore } from "renderer/stores/new-workspace-attachments";
import {
	useCloseNewWorkspaceModal,
	useNewWorkspaceModalOpen,
	usePreSelectedProjectId,
	usePreSelectedSession,
} from "renderer/stores/new-workspace-modal";
import {
	NEW_WORKSPACE_MODAL_DEFAULT_WIDTH,
	NEW_WORKSPACE_MODAL_MAX_WIDTH,
	NEW_WORKSPACE_MODAL_MIN_WIDTH,
	useNewWorkspaceWidthStore,
} from "renderer/stores/new-workspace-width";
import { DashboardNewWorkspaceModalContent } from "./components/DashboardNewWorkspaceModalContent";
import { SymmetricResizeHandles } from "./components/SymmetricResizeHandles";
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
	const storedWidth = useNewWorkspaceWidthStore((state) => state.modalWidth);
	const setStoredWidth = useNewWorkspaceWidthStore(
		(state) => state.setModalWidth,
	);
	/** Width while a resize drag is in flight; persisted on release. */
	const [liveWidth, setLiveWidth] = useState<number | null>(null);
	const modalWidth = liveWidth ?? storedWidth;

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
						<DialogTitle>New Workspace</DialogTitle>
						<DialogDescription>Create a new workspace</DialogDescription>
					</DialogHeader>
					<DialogContent
						showCloseButton={false}
						onFocusOutside={(e) => e.preventDefault()}
						// Top-anchored so the modal grows downward as the prompt grows,
						// instead of re-centering under the caret on every line.
						// transition-none: the base `duration-200` would otherwise
						// animate width, so resize drags lag the cursor and keyboard
						// steps read mid-transition widths. Open/close are keyframes.
						className={cn(
							"bg-popover text-popover-foreground max-h-[min(80vh,720px)] !top-[calc(50%-min(40vh,360px))] !translate-y-0 flex flex-col overflow-hidden p-0 transition-none",
							modalWidth === null
								? "sm:max-w-[680px]"
								: "sm:max-w-[calc(100%-2rem)]",
						)}
						style={modalWidth === null ? undefined : { width: modalWidth }}
					>
						<DashboardNewWorkspaceModalContent
							isOpen={isOpen}
							preSelectedProjectId={preSelectedProjectId}
							preSelectedSession={preSelectedSession}
						/>
						<SymmetricResizeHandles
							currentWidth={modalWidth ?? NEW_WORKSPACE_MODAL_DEFAULT_WIDTH}
							minWidth={NEW_WORKSPACE_MODAL_MIN_WIDTH}
							maxWidth={NEW_WORKSPACE_MODAL_MAX_WIDTH}
							onWidthChange={setLiveWidth}
							onWidthCommit={(width) => {
								setStoredWidth(width);
								setLiveWidth(null);
							}}
							onReset={() => {
								setStoredWidth(null);
								setLiveWidth(null);
							}}
						/>
					</DialogContent>
				</Dialog>
			</PromptInputProvider>
		</DashboardNewWorkspaceDraftProvider>
	);
}
