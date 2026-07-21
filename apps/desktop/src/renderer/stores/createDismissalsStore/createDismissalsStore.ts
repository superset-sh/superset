import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

export interface DismissalsStore {
	/** Map of id → epoch ms when it was dismissed. */
	dismissedAt: Record<string, number>;
	dismiss: (id: string) => void;
	isDismissed: (id: string) => boolean;
	reset: (id: string) => void;
}

/**
 * Factory for a persisted "timestamped id-keyed dismissals" store. Callers
 * pass a versioned persist key (e.g. "desktop-notice-dismissals-v1") and a
 * devtools label. Used by any "dismiss this card/notice, remember it" surface.
 */
export function createDismissalsStore(
	persistName: string,
	devtoolsName: string,
) {
	return create<DismissalsStore>()(
		devtools(
			persist(
				(set, get) => ({
					dismissedAt: {},
					dismiss: (id) =>
						set((state) => ({
							dismissedAt: { ...state.dismissedAt, [id]: Date.now() },
						})),
					isDismissed: (id) => id in get().dismissedAt,
					reset: (id) =>
						set((state) => {
							const next = { ...state.dismissedAt };
							delete next[id];
							return { dismissedAt: next };
						}),
				}),
				{ name: persistName },
			),
			{ name: devtoolsName },
		),
	);
}
