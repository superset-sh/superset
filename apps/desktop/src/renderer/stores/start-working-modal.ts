import type { TaskWithStatus } from "renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/hooks/useTasksTable";
import { create } from "zustand";
import { devtools } from "zustand/middleware";

interface StartWorkingModalState {
	isOpen: boolean;
	task: TaskWithStatus | null;
	openModal: (task: TaskWithStatus) => void;
	closeModal: () => void;
}

export const useStartWorkingModalStore = create<StartWorkingModalState>()(
	devtools(
		(set) => ({
			isOpen: false,
			task: null,

			openModal: (task: TaskWithStatus) => {
				set({ isOpen: true, task });
			},

			closeModal: () => {
				set({ isOpen: false, task: null });
			},
		}),
		{ name: "StartWorkingModalStore" },
	),
);

// Convenience hooks
export const useStartWorkingModalOpen = () =>
	useStartWorkingModalStore((state) => state.isOpen);
export const useStartWorkingModalTask = () =>
	useStartWorkingModalStore((state) => state.task);
export const useOpenStartWorkingModal = () =>
	useStartWorkingModalStore((state) => state.openModal);
export const useCloseStartWorkingModal = () =>
	useStartWorkingModalStore((state) => state.closeModal);
