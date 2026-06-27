import { create } from "zustand";

export type LinkedIssue = {
	slug: string;
	title: string;
	source?: "github" | "internal";
	url?: string;
	taskId?: string;
	number?: number;
	state?: "open" | "closed";
};

export type LinkedPR = {
	prNumber: number;
	title: string;
	url: string;
	state: string;
};

export type BaseBranchSource = "local" | "remote-tracking";

export interface DraftAttachment {
	localId: string;
	state: "uploading" | "ready" | "error";
	file: { name: string; size: number; mediaType: string };
	attachmentId?: string;
	error?: string;
}

export interface NewWorkspaceDraft {
	selectedProjectId: string | null;
	hostId: string | null;
	prompt: string;
	baseBranch: string | null;
	baseBranchSource: BaseBranchSource | null;
	workspaceName: string;
	workspaceNameEdited: boolean;
	branchName: string;
	branchNameEdited: boolean;
	linkedIssues: LinkedIssue[];
	linkedPR: LinkedPR | null;
	selectedAgentId: string | null;
	attachments: DraftAttachment[];
	/** True while `prompt` is the unedited setup-card seed; dropped on dismiss, cleared on edit. */
	promptSeededFromSetupCard: boolean;
}

interface NewWorkspaceDraftState extends NewWorkspaceDraft {
	resetKey: number;
	updateDraft: (patch: Partial<NewWorkspaceDraft>) => void;
	addAttachment: (attachment: DraftAttachment) => void;
	updateAttachment: (localId: string, patch: Partial<DraftAttachment>) => void;
	removeAttachment: (localId: string) => void;
	resetDraft: () => void;
	seedSetupPrompt: (prompt: string) => void;
}

function buildInitialDraft(): NewWorkspaceDraft {
	return {
		selectedProjectId: null,
		hostId: null,
		prompt: "",
		baseBranch: null,
		baseBranchSource: null,
		workspaceName: "",
		workspaceNameEdited: false,
		branchName: "",
		branchNameEdited: false,
		linkedIssues: [],
		linkedPR: null,
		selectedAgentId: null,
		attachments: [],
		promptSeededFromSetupCard: false,
	};
}

export const useNewWorkspaceDraftStore = create<NewWorkspaceDraftState>(
	(set, get) => ({
		...buildInitialDraft(),
		resetKey: 0,
		updateDraft: (patch) =>
			set((state) => ({
				...state,
				...patch,
				// A real prompt edit is user content; seeding bypasses updateDraft, so this only ever clears the flag.
				...(patch.prompt !== undefined && patch.prompt !== state.prompt
					? { promptSeededFromSetupCard: false }
					: {}),
			})),
		addAttachment: (attachment) =>
			set((state) => ({
				...state,
				attachments: [...state.attachments, attachment],
			})),
		updateAttachment: (localId, patch) =>
			set((state) => ({
				...state,
				attachments: state.attachments.map((entry) =>
					entry.localId === localId ? { ...entry, ...patch } : entry,
				),
			})),
		removeAttachment: (localId) =>
			set((state) => ({
				...state,
				attachments: state.attachments.filter(
					(entry) => entry.localId !== localId,
				),
			})),
		resetDraft: () =>
			set((state) => ({
				...buildInitialDraft(),
				resetKey: state.resetKey + 1,
				updateDraft: state.updateDraft,
				addAttachment: state.addAttachment,
				updateAttachment: state.updateAttachment,
				removeAttachment: state.removeAttachment,
				resetDraft: state.resetDraft,
				seedSetupPrompt: state.seedSetupPrompt,
			})),
		seedSetupPrompt: (prompt) => {
			// resetDraft clears + bumps resetKey (remounts the editor); the shallow merge keeps the flag.
			get().resetDraft();
			set({ prompt, promptSeededFromSetupCard: true });
		},
	}),
);
