import type { TaskWithStatus } from "renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/hooks/useTasksTable";
import { create } from "zustand";
import { devtools } from "zustand/middleware";

interface StartWorkingModalState {
	isOpen: boolean;
	tasks: TaskWithStatus[];
	openModal: (tasks: TaskWithStatus | TaskWithStatus[]) => void;
	closeModal: () => void;
}

export const useStartWorkingModalStore = create<StartWorkingModalState>()(
	devtools(
		(set) => ({
			isOpen: false,
			tasks: [],

			openModal: (input: TaskWithStatus | TaskWithStatus[]) => {
				const tasks = Array.isArray(input) ? input : [input];
				set({ isOpen: true, tasks });
			},

			closeModal: () => {
				set({ isOpen: false, tasks: [] });
			},
		}),
		{ name: "StartWorkingModalStore" },
	),
);

// Convenience hooks
export const useStartWorkingModalOpen = () =>
	useStartWorkingModalStore((state) => state.isOpen);
export const useStartWorkingModalTasks = () =>
	useStartWorkingModalStore((state) => state.tasks);
export const useOpenStartWorkingModal = () =>
	useStartWorkingModalStore((state) => state.openModal);
export const useCloseStartWorkingModal = () =>
	useStartWorkingModalStore((state) => state.closeModal);
