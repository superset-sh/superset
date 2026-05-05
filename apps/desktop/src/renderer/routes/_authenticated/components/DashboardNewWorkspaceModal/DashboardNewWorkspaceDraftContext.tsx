import {
	createContext,
	type PropsWithChildren,
	useCallback,
	useContext,
	useMemo,
} from "react";
import {
	type NewWorkspaceDraft,
	useNewWorkspaceDraftStore,
} from "renderer/stores/new-workspace-draft";
import { useShallow } from "zustand/react/shallow";

export type {
	BaseBranchSource,
	LinkedIssue,
	LinkedPR,
} from "renderer/stores/new-workspace-draft";
export type DashboardNewWorkspaceDraft = NewWorkspaceDraft;

interface DraftContextValue {
	closeModal: () => void;
	closeAndResetDraft: () => void;
}

const DraftContext = createContext<DraftContextValue | null>(null);

export function DashboardNewWorkspaceDraftProvider({
	children,
	onClose,
}: PropsWithChildren<{ onClose: () => void }>) {
	const resetDraft = useNewWorkspaceDraftStore((store) => store.resetDraft);
	const closeAndResetDraft = useCallback(() => {
		resetDraft();
		onClose();
	}, [onClose, resetDraft]);

	const value = useMemo<DraftContextValue>(
		() => ({ closeModal: onClose, closeAndResetDraft }),
		[onClose, closeAndResetDraft],
	);

	return (
		<DraftContext.Provider value={value}>{children}</DraftContext.Provider>
	);
}

export function useDashboardNewWorkspaceDraft() {
	const ctx = useContext(DraftContext);
	if (!ctx) {
		throw new Error(
			"useDashboardNewWorkspaceDraft must be used within DashboardNewWorkspaceDraftProvider",
		);
	}
	const draft = useNewWorkspaceDraftStore<NewWorkspaceDraft>(
		useShallow((store) => ({
			selectedProjectId: store.selectedProjectId,
			hostId: store.hostId,
			prompt: store.prompt,
			baseBranch: store.baseBranch,
			baseBranchSource: store.baseBranchSource,
			workspaceName: store.workspaceName,
			workspaceNameEdited: store.workspaceNameEdited,
			branchName: store.branchName,
			branchNameEdited: store.branchNameEdited,
			linkedIssues: store.linkedIssues,
			linkedPR: store.linkedPR,
			selectedAgentId: store.selectedAgentId,
			attachments: store.attachments,
		})),
	);
	const updateDraft = useNewWorkspaceDraftStore((store) => store.updateDraft);
	const resetDraft = useNewWorkspaceDraftStore((store) => store.resetDraft);
	const resetKey = useNewWorkspaceDraftStore((store) => store.resetKey);

	return {
		draft,
		updateDraft,
		resetDraft,
		resetKey,
		closeModal: ctx.closeModal,
		closeAndResetDraft: ctx.closeAndResetDraft,
	};
}
