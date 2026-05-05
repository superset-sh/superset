import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

interface V2SetupCardDismissalsState {
	/** Map of v2 projectId → epoch ms when the card was dismissed. */
	dismissedAt: Record<string, number>;
	dismiss: (projectId: string) => void;
	isDismissed: (projectId: string) => boolean;
	reset: (projectId: string) => void;
}

export const useV2SetupCardDismissalsStore =
	create<V2SetupCardDismissalsState>()(
		devtools(
			persist(
				(set, get) => ({
					dismissedAt: {},
					dismiss: (projectId) =>
						set((state) => ({
							dismissedAt: { ...state.dismissedAt, [projectId]: Date.now() },
						})),
					isDismissed: (projectId) => projectId in get().dismissedAt,
					reset: (projectId) =>
						set((state) => {
							const next = { ...state.dismissedAt };
							delete next[projectId];
							return { dismissedAt: next };
						}),
				}),
				{ name: "v2-setup-card-dismissals-v1" },
			),
			{ name: "V2SetupCardDismissals" },
		),
	);
