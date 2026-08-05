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
}

interface NewWorkspaceDraftState extends NewWorkspaceDraft {
	resetKey: number;
	/**
	 * True while `prompt` holds prefilled content (e.g. the setup-script
	 * Configure card) that the user hasn't edited yet. Lets dismissal discard
	 * the seed without touching user-typed drafts.
	 */
	promptSeeded: boolean;
	updateDraft: (patch: Partial<NewWorkspaceDraft>) => void;
	addAttachment: (attachment: DraftAttachment) => void;
	updateAttachment: (localId: string, patch: Partial<DraftAttachment>) => void;
	removeAttachment: (localId: string) => void;
	resetDraft: () => void;
	/** Resets the draft and prefills `prompt` with seeded (non-user) content. */
	seedPrompt: (prompt: string) => void;
	/** Clears `prompt` if it still holds an unedited seed; no-op otherwise. */
	discardSeededPrompt: () => void;
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
	};
}

export const useNewWorkspaceDraftStore = create<NewWorkspaceDraftState>(
	(set) => ({
		...buildInitialDraft(),
		resetKey: 0,
		promptSeeded: false,
		updateDraft: (patch) =>
			set((state) => ({
				...state,
				...patch,
				// Any actual prompt edit turns the seed into user content.
				promptSeeded:
					patch.prompt !== undefined && patch.prompt !== state.prompt
						? false
						: state.promptSeeded,
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
				promptSeeded: false,
				updateDraft: state.updateDraft,
				addAttachment: state.addAttachment,
				updateAttachment: state.updateAttachment,
				removeAttachment: state.removeAttachment,
				resetDraft: state.resetDraft,
				seedPrompt: state.seedPrompt,
				discardSeededPrompt: state.discardSeededPrompt,
			})),
		seedPrompt: (prompt) =>
			set((state) => ({
				...buildInitialDraft(),
				resetKey: state.resetKey + 1,
				prompt,
				promptSeeded: true,
			})),
		discardSeededPrompt: () =>
			set((state) =>
				state.promptSeeded ? { prompt: "", promptSeeded: false } : {},
			),
	}),
);
