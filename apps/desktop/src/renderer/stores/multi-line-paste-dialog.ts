import { create } from "zustand";
import { devtools } from "zustand/middleware";

export type MultiLinePasteDecision =
	| { kind: "paste" }
	| { kind: "pasteAsOneLine" }
	| { kind: "cancel" };

interface MultiLinePasteDialogState {
	isOpen: boolean;
	text: string;
	resolve: ((decision: MultiLinePasteDecision) => void) | null;
	open: (text: string) => Promise<MultiLinePasteDecision>;
	decide: (decision: MultiLinePasteDecision) => void;
}

export const useMultiLinePasteDialogStore = create<MultiLinePasteDialogState>()(
	devtools(
		(set, get) => ({
			isOpen: false,
			text: "",
			resolve: null,

			open: (text) =>
				new Promise<MultiLinePasteDecision>((resolve) => {
					get().resolve?.({ kind: "cancel" });
					set({ isOpen: true, text, resolve });
				}),

			decide: (decision) => {
				const { resolve } = get();
				resolve?.(decision);
				set({ isOpen: false, text: "", resolve: null });
			},
		}),
		{ name: "MultiLinePasteDialogStore" },
	),
);
