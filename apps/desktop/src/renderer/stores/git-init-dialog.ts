import { create } from "zustand";
import { devtools } from "zustand/middleware";

interface GitInitDialogState {
	isOpen: boolean;
	isPending: boolean;
	paths: string[];
	onConfirm: (() => void) | null;
	onCancel: (() => void) | null;
	open: (params: {
		paths: string[];
		onConfirm: () => void;
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
			paths: [],
			onConfirm: null,
			onCancel: null,

			open: ({ paths, onConfirm, onCancel }) => {
				set({ isOpen: true, isPending: false, paths, onConfirm, onCancel });
			},

			setIsPending: (isPending) => {
				set({ isPending });
			},

			close: () => {
				set({
					isOpen: false,
					isPending: false,
					paths: [],
					onConfirm: null,
					onCancel: null,
				});
			},
		}),
		{ name: "GitInitDialogStore" },
	),
);
