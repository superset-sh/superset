import { create } from "zustand";
import { devtools } from "zustand/middleware";

interface InviteMemberDialogState {
	isOpen: boolean;
	setOpen: (isOpen: boolean) => void;
}

export const useInviteMemberDialogStore = create<InviteMemberDialogState>()(
	devtools(
		(set) => ({
			isOpen: false,
			setOpen: (isOpen) => set({ isOpen }),
		}),
		{ name: "InviteMemberDialogStore" },
	),
);
