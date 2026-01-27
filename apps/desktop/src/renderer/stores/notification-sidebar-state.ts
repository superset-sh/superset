import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

const DEFAULT_NOTIFICATION_SIDEBAR_WIDTH = 320;
const MIN_NOTIFICATION_SIDEBAR_WIDTH = 280;
const MAX_NOTIFICATION_SIDEBAR_WIDTH = 480;

interface NotificationSidebarState {
	isOpen: boolean;
	width: number;
	isResizing: boolean;

	toggleOpen: () => void;
	setOpen: (open: boolean) => void;
	setWidth: (width: number) => void;
	setIsResizing: (isResizing: boolean) => void;
}

export const useNotificationSidebarStore = create<NotificationSidebarState>()(
	devtools(
		persist(
			(set) => ({
				isOpen: false,
				width: DEFAULT_NOTIFICATION_SIDEBAR_WIDTH,
				isResizing: false,

				toggleOpen: () => {
					set((state) => ({ isOpen: !state.isOpen }));
				},

				setOpen: (open) => {
					set({ isOpen: open });
				},

				setWidth: (width) => {
					const clampedWidth = Math.max(
						MIN_NOTIFICATION_SIDEBAR_WIDTH,
						Math.min(MAX_NOTIFICATION_SIDEBAR_WIDTH, width),
					);
					set({ width: clampedWidth });
				},

				setIsResizing: (isResizing) => {
					set({ isResizing });
				},
			}),
			{
				name: "notification-sidebar-store",
				version: 1,
				partialize: (state) => ({
					isOpen: state.isOpen,
					width: state.width,
				}),
			},
		),
		{ name: "NotificationSidebarStore" },
	),
);

export { MAX_NOTIFICATION_SIDEBAR_WIDTH, MIN_NOTIFICATION_SIDEBAR_WIDTH };
