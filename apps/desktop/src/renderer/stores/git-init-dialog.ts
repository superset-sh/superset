import { create } from "zustand";
import { devtools } from "zustand/middleware";

export interface GitInitDialogFolder {
	path: string;
	/** Set when `path` is not a repo root but sits inside one. Git resolves
	 *  such a folder to this enclosing repo, so the user is offered that as
	 *  an alternative to initializing the folder they picked. */
	enclosingRepoPath?: string;
}

interface GitInitDialogState {
	isOpen: boolean;
	isPending: boolean;
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
	setIsPending: (isPending: boolean) => void;
	close: () => void;
}

export const useGitInitDialogStore = create<GitInitDialogState>()(
	devtools(
		(set) => ({
			isOpen: false,
			isPending: false,
			folders: [],
			onConfirm: null,
			onOpenEnclosing: null,
			onCancel: null,

			open: ({ folders, onConfirm, onOpenEnclosing, onCancel }) => {
				set({
					isOpen: true,
					isPending: false,
					folders,
					onConfirm,
					onOpenEnclosing,
					onCancel,
				});
			},

			setIsPending: (isPending) => {
				set({ isPending });
			},

			close: () => {
				set({
					isOpen: false,
					isPending: false,
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
