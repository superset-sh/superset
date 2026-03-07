import { create } from "zustand";
import { devtools } from "zustand/middleware";

export type NewWorkspaceModalTab =
	| "prompt"
	| "issues"
	| "pull-requests"
	| "branches";

interface NewWorkspaceModalState {
	isOpen: boolean;
	draftVersion: number;
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
	clearInputsIfDraftVersion: (draftVersion: number) => void;
}

export const useNewWorkspaceModalStore = create<NewWorkspaceModalState>()(
	devtools(
		(set) => ({
			isOpen: false,
			draftVersion: 0,
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
					draftVersion:
						projectId != null && projectId !== state.selectedProjectId
							? state.draftVersion + 1
							: state.draftVersion,
				}));
			},

			closeModal: () => {
				set({ isOpen: false });
			},

			setActiveTab: (activeTab) =>
				set((state) => ({ activeTab, draftVersion: state.draftVersion + 1 })),
			setSelectedProjectId: (selectedProjectId) =>
				set((state) => ({
					selectedProjectId,
					draftVersion: state.draftVersion + 1,
				})),
			setPrompt: (prompt) =>
				set((state) => ({ prompt, draftVersion: state.draftVersion + 1 })),
			setBranchName: (branchName) =>
				set((state) => ({ branchName, draftVersion: state.draftVersion + 1 })),
			setBranchNameEdited: (branchNameEdited) =>
				set((state) => ({
					branchNameEdited,
					draftVersion: state.draftVersion + 1,
				})),
			setBaseBranch: (baseBranch) =>
				set((state) => ({ baseBranch, draftVersion: state.draftVersion + 1 })),
			setShowAdvanced: (showAdvanced) =>
				set((state) => ({
					showAdvanced,
					draftVersion: state.draftVersion + 1,
				})),
			setRunSetupScript: (runSetupScript) =>
				set((state) => ({
					runSetupScript,
					draftVersion: state.draftVersion + 1,
				})),
			setBranchSearch: (branchSearch) =>
				set((state) => ({
					branchSearch,
					draftVersion: state.draftVersion + 1,
				})),
			setIssuesQuery: (issuesQuery) =>
				set((state) => ({
					issuesQuery,
					draftVersion: state.draftVersion + 1,
				})),
			setPullRequestsQuery: (pullRequestsQuery) =>
				set((state) => ({
					pullRequestsQuery,
					draftVersion: state.draftVersion + 1,
				})),
			setBranchesQuery: (branchesQuery) =>
				set((state) => ({
					branchesQuery,
					draftVersion: state.draftVersion + 1,
				})),
			clearInputs: () =>
				set((state) => ({
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
					draftVersion: state.draftVersion + 1,
				})),
			clearInputsIfDraftVersion: (draftVersion) =>
				set((state) =>
					state.draftVersion !== draftVersion
						? {}
						: {
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
								draftVersion: state.draftVersion + 1,
							},
				),
		}),
		{ name: "NewWorkspaceModalStore" },
	),
);

// Convenience hooks
export const useNewWorkspaceModalOpen = () =>
	useNewWorkspaceModalStore((state) => state.isOpen);
export const useNewWorkspaceModalDraftVersion = () =>
	useNewWorkspaceModalStore((state) => state.draftVersion);
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
export const useClearNewWorkspaceModalInputsIfDraftVersion = () =>
	useNewWorkspaceModalStore((state) => state.clearInputsIfDraftVersion);
