import { create } from "zustand";
import { devtools } from "zustand/middleware";

export type V1ImportPage = "welcome" | "projects" | "workspaces" | "presets";

export const V1_IMPORT_PAGE_ORDER: V1ImportPage[] = [
	"welcome",
	"projects",
	"workspaces",
	"presets",
];

interface V1ImportModalState {
	isOpen: boolean;
	page: V1ImportPage;
	openModal: (page?: V1ImportPage) => void;
	closeModal: () => void;
	setPage: (page: V1ImportPage) => void;
}

export const useV1ImportModalStore = create<V1ImportModalState>()(
	devtools(
		(set) => ({
			isOpen: false,
			page: "welcome",
			openModal: (page) => {
				set({ isOpen: true, page: page ?? "welcome" });
			},
			closeModal: () => {
				set({ isOpen: false });
			},
			setPage: (page) => {
				set({ page });
			},
		}),
		{ name: "V1ImportModalStore" },
	),
);

export const useV1ImportModalOpen = () =>
	useV1ImportModalStore((state) => state.isOpen);
export const useOpenV1ImportModal = () =>
	useV1ImportModalStore((state) => state.openModal);
export const useCloseV1ImportModal = () =>
	useV1ImportModalStore((state) => state.closeModal);
