import { create } from "zustand";
import { devtools } from "zustand/middleware";

export type NewWorkspaceModalTab =
	| "prompt"
	| "issues"
	| "pull-requests"
	| "branches";

interface NewWorkspaceModalState {
	isOpen: boolean;
	activeTab: NewWorkspaceModalTab;
	selectedProjectId: string | null;
	prompt: string;
	branchName: string;
	branchNameEdited: boolean;
	baseBranch: string | null;
	showAdvanced: boolean;
	runSetupScript: boolean;
	branchSearch: string;
	issuesQuery: string;
	pullRequestsQuery: string;
	branchesQuery: string;
	openModal: (projectId?: string) => void;
	closeModal: () => void;
	setActiveTab: (tab: NewWorkspaceModalTab) => void;
	setSelectedProjectId: (projectId: string | null) => void;
	setPrompt: (prompt: string) => void;
	setBranchName: (branchName: string) => void;
	setBranchNameEdited: (edited: boolean) => void;
	setBaseBranch: (baseBranch: string | null) => void;
	setShowAdvanced: (showAdvanced: boolean) => void;
	setRunSetupScript: (runSetupScript: boolean) => void;
	setBranchSearch: (branchSearch: string) => void;
	setIssuesQuery: (query: string) => void;
	setPullRequestsQuery: (query: string) => void;
	setBranchesQuery: (query: string) => void;
	clearInputs: () => void;
}

export const useNewWorkspaceModalStore = create<NewWorkspaceModalState>()(
	devtools(
		(set) => ({
			isOpen: false,
			activeTab: "prompt",
			selectedProjectId: null,
			prompt: "",
			branchName: "",
			branchNameEdited: false,
			baseBranch: null,
			showAdvanced: false,
			runSetupScript: true,
			branchSearch: "",
			issuesQuery: "",
			pullRequestsQuery: "",
			branchesQuery: "",

			openModal: (projectId?: string) => {
				set((state) => ({
					isOpen: true,
					selectedProjectId: projectId ?? state.selectedProjectId,
				}));
			},

			closeModal: () => {
				set({ isOpen: false });
			},

			setActiveTab: (activeTab) => set({ activeTab }),
			setSelectedProjectId: (selectedProjectId) => set({ selectedProjectId }),
			setPrompt: (prompt) => set({ prompt }),
			setBranchName: (branchName) => set({ branchName }),
			setBranchNameEdited: (branchNameEdited) => set({ branchNameEdited }),
			setBaseBranch: (baseBranch) => set({ baseBranch }),
			setShowAdvanced: (showAdvanced) => set({ showAdvanced }),
			setRunSetupScript: (runSetupScript) => set({ runSetupScript }),
			setBranchSearch: (branchSearch) => set({ branchSearch }),
			setIssuesQuery: (issuesQuery) => set({ issuesQuery }),
			setPullRequestsQuery: (pullRequestsQuery) => set({ pullRequestsQuery }),
			setBranchesQuery: (branchesQuery) => set({ branchesQuery }),
			clearInputs: () =>
				set({
					prompt: "",
					branchName: "",
					branchNameEdited: false,
					baseBranch: null,
					showAdvanced: false,
					runSetupScript: true,
					branchSearch: "",
					issuesQuery: "",
					pullRequestsQuery: "",
					branchesQuery: "",
				}),
		}),
		{ name: "NewWorkspaceModalStore" },
	),
);

// Convenience hooks
export const useNewWorkspaceModalOpen = () =>
	useNewWorkspaceModalStore((state) => state.isOpen);
export const useOpenNewWorkspaceModal = () =>
	useNewWorkspaceModalStore((state) => state.openModal);
export const useCloseNewWorkspaceModal = () =>
	useNewWorkspaceModalStore((state) => state.closeModal);
export const useNewWorkspaceModalActiveTab = () =>
	useNewWorkspaceModalStore((state) => state.activeTab);
export const useSetNewWorkspaceModalActiveTab = () =>
	useNewWorkspaceModalStore((state) => state.setActiveTab);
export const useSelectedNewWorkspaceModalProjectId = () =>
	useNewWorkspaceModalStore((state) => state.selectedProjectId);
export const useSetSelectedNewWorkspaceModalProjectId = () =>
	useNewWorkspaceModalStore((state) => state.setSelectedProjectId);
export const useNewWorkspaceModalPrompt = () =>
	useNewWorkspaceModalStore((state) => state.prompt);
export const useSetNewWorkspaceModalPrompt = () =>
	useNewWorkspaceModalStore((state) => state.setPrompt);
export const useNewWorkspaceModalBranchName = () =>
	useNewWorkspaceModalStore((state) => state.branchName);
export const useSetNewWorkspaceModalBranchName = () =>
	useNewWorkspaceModalStore((state) => state.setBranchName);
export const useNewWorkspaceModalBranchNameEdited = () =>
	useNewWorkspaceModalStore((state) => state.branchNameEdited);
export const useSetNewWorkspaceModalBranchNameEdited = () =>
	useNewWorkspaceModalStore((state) => state.setBranchNameEdited);
export const useNewWorkspaceModalBaseBranch = () =>
	useNewWorkspaceModalStore((state) => state.baseBranch);
export const useSetNewWorkspaceModalBaseBranch = () =>
	useNewWorkspaceModalStore((state) => state.setBaseBranch);
export const useNewWorkspaceModalShowAdvanced = () =>
	useNewWorkspaceModalStore((state) => state.showAdvanced);
export const useSetNewWorkspaceModalShowAdvanced = () =>
	useNewWorkspaceModalStore((state) => state.setShowAdvanced);
export const useNewWorkspaceModalRunSetupScript = () =>
	useNewWorkspaceModalStore((state) => state.runSetupScript);
export const useSetNewWorkspaceModalRunSetupScript = () =>
	useNewWorkspaceModalStore((state) => state.setRunSetupScript);
export const useNewWorkspaceModalBranchSearch = () =>
	useNewWorkspaceModalStore((state) => state.branchSearch);
export const useSetNewWorkspaceModalBranchSearch = () =>
	useNewWorkspaceModalStore((state) => state.setBranchSearch);
export const useNewWorkspaceModalIssuesQuery = () =>
	useNewWorkspaceModalStore((state) => state.issuesQuery);
export const useSetNewWorkspaceModalIssuesQuery = () =>
	useNewWorkspaceModalStore((state) => state.setIssuesQuery);
export const useNewWorkspaceModalPullRequestsQuery = () =>
	useNewWorkspaceModalStore((state) => state.pullRequestsQuery);
export const useSetNewWorkspaceModalPullRequestsQuery = () =>
	useNewWorkspaceModalStore((state) => state.setPullRequestsQuery);
export const useNewWorkspaceModalBranchesQuery = () =>
	useNewWorkspaceModalStore((state) => state.branchesQuery);
export const useSetNewWorkspaceModalBranchesQuery = () =>
	useNewWorkspaceModalStore((state) => state.setBranchesQuery);
export const useClearNewWorkspaceModalInputs = () =>
	useNewWorkspaceModalStore((state) => state.clearInputs);
