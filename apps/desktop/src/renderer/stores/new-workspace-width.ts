import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

// Widths are the composer box itself (the old max-w-[640px] wrapper minus
// its px-6 padding).
export const NEW_WORKSPACE_SCREEN_DEFAULT_WIDTH = 592;
export const NEW_WORKSPACE_SCREEN_MIN_WIDTH = 520;
export const NEW_WORKSPACE_SCREEN_MAX_WIDTH = 1080;

interface NewWorkspaceWidthState {
	/** User-resized screen composer width; null = default. */
	screenWidth: number | null;
	setScreenWidth: (width: number | null) => void;
}

/** Persisted symmetric-resize width for the new-workspace screen composer. */
export const useNewWorkspaceWidthStore = create<NewWorkspaceWidthState>()(
	devtools(
		persist(
			(set) => ({
				screenWidth: null,
				setScreenWidth: (width) =>
					set({
						screenWidth:
							width === null
								? null
								: Math.round(
										Math.max(
											NEW_WORKSPACE_SCREEN_MIN_WIDTH,
											Math.min(NEW_WORKSPACE_SCREEN_MAX_WIDTH, width),
										),
									),
					}),
			}),
			{ name: "new-workspace-width" },
		),
		{ name: "NewWorkspaceWidthStore" },
	),
);
