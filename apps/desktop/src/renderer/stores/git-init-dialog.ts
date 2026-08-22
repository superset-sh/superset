import { create } from "zustand";
import { devtools } from "zustand/middleware";

export interface GitInitDialogFolder {
	path: string;
	/** Set when `path` is not a repo root but sits inside one. Git resolves
	 *  such a folder to this enclosing repo, so the user is offered that as
	 *  an alternative to initializing the folder they picked. */
	enclosingRepoPath?: string;
}

/** Which action is running, so each button can label its own progress. */
export type GitInitDialogAction = "init" | "openEnclosing";

interface GitInitDialogState {
	isOpen: boolean;
	pendingAction: GitInitDialogAction | null;
	folders: GitInitDialogFolder[];
	onConfirm: (() => void) | null;
	onOpenEnclosing: (() => void) | null;
	onCancel: (() => void) | null;
	open: (params: {
		folders: GitInitDialogFolder[];
		onConfirm: () => void;
		onOpenEnclosing: () => void;
		onCancel: () => void;
	}) => void;
	setPendingAction: (pendingAction: GitInitDialogAction | null) => void;
	close: () => void;
}

export const useGitInitDialogStore = create<GitInitDialogState>()(
	devtools(
		(set) => ({
			isOpen: false,
			pendingAction: null,
			folders: [],
			onConfirm: null,
			onOpenEnclosing: null,
			onCancel: null,

			open: ({ folders, onConfirm, onOpenEnclosing, onCancel }) => {
				set({
					isOpen: true,
					pendingAction: null,
					folders,
					onConfirm,
					onOpenEnclosing,
					onCancel,
				});
			},

			setPendingAction: (pendingAction) => {
				set({ pendingAction });
			},

			close: () => {
				set({
					isOpen: false,
					pendingAction: null,
					folders: [],
					onConfirm: null,
					onOpenEnclosing: null,
					onCancel: null,
				});
			},
		}),
		{ name: "GitInitDialogStore" },
	),
);
