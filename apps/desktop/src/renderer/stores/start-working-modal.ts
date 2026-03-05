import type { TaskWithStatus } from "renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/hooks/useTasksTable";
import { create } from "zustand";
import { devtools } from "zustand/middleware";

interface OpenModalOptions {
	tasks: TaskWithStatus | TaskWithStatus[];
	projectId?: string;
}

interface StartWorkingModalState {
	isOpen: boolean;
	tasks: TaskWithStatus[];
	preSelectedProjectId: string | null;
	openModal: (opts: OpenModalOptions) => void;
	closeModal: () => void;
}

export const useStartWorkingModalStore = create<StartWorkingModalState>()(
	devtools(
		(set) => ({
			isOpen: false,
			tasks: [],
			preSelectedProjectId: null,

			openModal: ({ tasks: input, projectId }: OpenModalOptions) => {
				const tasks = Array.isArray(input) ? input : [input];
				set({ isOpen: true, tasks, preSelectedProjectId: projectId ?? null });
			},

			closeModal: () => {
				set({ isOpen: false, tasks: [], preSelectedProjectId: null });
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
export const useStartWorkingModalPreSelectedProjectId = () =>
	useStartWorkingModalStore((state) => state.preSelectedProjectId);
export const useOpenStartWorkingModal = () =>
	useStartWorkingModalStore((state) => state.openModal);
export const useCloseStartWorkingModal = () =>
	useStartWorkingModalStore((state) => state.closeModal);
