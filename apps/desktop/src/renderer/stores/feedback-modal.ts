import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

interface FeedbackImage {
	id: string;
	dataUrl: string;
	name: string;
}

interface FeedbackModalState {
	isOpen: boolean;
	message: string;
	images: FeedbackImage[];
	openModal: () => void;
	closeModal: () => void;
	setMessage: (message: string) => void;
	addImage: (image: FeedbackImage) => void;
	removeImage: (id: string) => void;
	clearForm: () => void;
}

export const useFeedbackModalStore = create<FeedbackModalState>()(
	devtools(
		persist(
			(set) => ({
				isOpen: false,
				message: "",
				images: [],

				openModal: () => set({ isOpen: true }),
				closeModal: () => set({ isOpen: false }),

				setMessage: (message) => set({ message }),

				addImage: (image) =>
					set((state) => ({ images: [...state.images, image] })),

				removeImage: (id) =>
					set((state) => ({
						images: state.images.filter((img) => img.id !== id),
					})),

				clearForm: () => set({ message: "", images: [] }),
			}),
			{
				name: "feedback-form-storage",
				partialize: (state) => ({
					message: state.message,
					images: state.images,
				}),
			},
		),
		{ name: "FeedbackModalStore" },
	),
);

export const useFeedbackModalOpen = () =>
	useFeedbackModalStore((state) => state.isOpen);
export const useOpenFeedbackModal = () =>
	useFeedbackModalStore((state) => state.openModal);
export const useCloseFeedbackModal = () =>
	useFeedbackModalStore((state) => state.closeModal);
export const useFeedbackMessage = () =>
	useFeedbackModalStore((state) => state.message);
export const useFeedbackImages = () =>
	useFeedbackModalStore((state) => state.images);
export const useSetFeedbackMessage = () =>
	useFeedbackModalStore((state) => state.setMessage);
export const useAddFeedbackImage = () =>
	useFeedbackModalStore((state) => state.addImage);
export const useRemoveFeedbackImage = () =>
	useFeedbackModalStore((state) => state.removeImage);
export const useClearFeedbackForm = () =>
	useFeedbackModalStore((state) => state.clearForm);
