import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

const DEFAULT_CHAT_PANEL_SIZE = 30;

interface ChatPanelState {
	isOpen: boolean;
	size: number;
	togglePanel: () => void;
	setOpen: (open: boolean) => void;
	setSize: (size: number) => void;
}

export const useChatPanelStore = create<ChatPanelState>()(
	devtools(
		persist(
			(set, get) => ({
				isOpen: true,
				size: DEFAULT_CHAT_PANEL_SIZE,

				togglePanel: () => {
					const { isOpen, size } = get();
					if (isOpen) {
						set({ isOpen: false });
					} else {
						set({
							isOpen: true,
							size: size === 0 ? DEFAULT_CHAT_PANEL_SIZE : size,
						});
					}
				},

				setOpen: (open) => {
					const { size } = get();
					set({
						isOpen: open,
						size: open && size === 0 ? DEFAULT_CHAT_PANEL_SIZE : size,
					});
				},

				setSize: (size) => {
					set({
						size,
						isOpen: size > 0,
					});
				},
			}),
			{ name: "chat-panel-store" },
		),
		{ name: "ChatPanelStore" },
	),
);
