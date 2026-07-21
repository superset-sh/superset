import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

interface DesktopNoticeDismissalsState {
	/** Map of notice id → epoch ms when it was dismissed. */
	dismissedAt: Record<string, number>;
	dismiss: (noticeId: string) => void;
	isDismissed: (noticeId: string) => boolean;
}

export const useDesktopNoticeDismissalsStore =
	create<DesktopNoticeDismissalsState>()(
		devtools(
			persist(
				(set, get) => ({
					dismissedAt: {},
					dismiss: (noticeId) =>
						set((state) => ({
							dismissedAt: { ...state.dismissedAt, [noticeId]: Date.now() },
						})),
					isDismissed: (noticeId) => noticeId in get().dismissedAt,
				}),
				{ name: "desktop-notice-dismissals-v1" },
			),
			{ name: "DesktopNoticeDismissals" },
		),
	);
