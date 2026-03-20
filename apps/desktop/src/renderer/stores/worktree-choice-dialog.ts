import { create } from "zustand";
import { devtools } from "zustand/middleware";

interface WorktreeChoiceDialogState {
	isOpen: boolean;
	projectName: string;
	onChoice: ((enableWorktrees: boolean) => void) | null;
	open: (params: {
		projectName: string;
		onChoice: (enableWorktrees: boolean) => void;
	}) => void;
	close: () => void;
}

export const useWorktreeChoiceDialogStore = create<WorktreeChoiceDialogState>()(
	devtools(
		(set) => ({
			isOpen: false,
			projectName: "",
			onChoice: null,

			open: ({ projectName, onChoice }) => {
				set({ isOpen: true, projectName, onChoice });
			},

			close: () => {
				set({ isOpen: false, projectName: "", onChoice: null });
			},
		}),
		{ name: "WorktreeChoiceDialogStore" },
	),
);
