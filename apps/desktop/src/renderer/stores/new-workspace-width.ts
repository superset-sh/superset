import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

export const NEW_WORKSPACE_MODAL_DEFAULT_WIDTH = 680;
export const NEW_WORKSPACE_MODAL_MIN_WIDTH = 600;
export const NEW_WORKSPACE_MODAL_MAX_WIDTH = 1200;

// Screen widths are the composer box itself (the old max-w-[640px] wrapper
// minus its px-6 padding).
export const NEW_WORKSPACE_SCREEN_DEFAULT_WIDTH = 592;
export const NEW_WORKSPACE_SCREEN_MIN_WIDTH = 520;
export const NEW_WORKSPACE_SCREEN_MAX_WIDTH = 1080;

interface NewWorkspaceWidthState {
	/** User-resized modal width; null = default. */
	modalWidth: number | null;
	/** User-resized screen composer width; null = default. */
	screenWidth: number | null;
	setModalWidth: (width: number | null) => void;
	setScreenWidth: (width: number | null) => void;
}

const clamp = (width: number, min: number, max: number) =>
	Math.round(Math.max(min, Math.min(max, width)));

/** Persisted symmetric-resize widths for the new-workspace create surfaces. */
export const useNewWorkspaceWidthStore = create<NewWorkspaceWidthState>()(
	devtools(
		persist(
			(set) => ({
				modalWidth: null,
				screenWidth: null,
				setModalWidth: (width) =>
					set({
						modalWidth:
							width === null
								? null
								: clamp(
										width,
										NEW_WORKSPACE_MODAL_MIN_WIDTH,
										NEW_WORKSPACE_MODAL_MAX_WIDTH,
									),
					}),
				setScreenWidth: (width) =>
					set({
						screenWidth:
							width === null
								? null
								: clamp(
										width,
										NEW_WORKSPACE_SCREEN_MIN_WIDTH,
										NEW_WORKSPACE_SCREEN_MAX_WIDTH,
									),
					}),
			}),
			{ name: "new-workspace-width" },
		),
		{ name: "NewWorkspaceWidthStore" },
	),
);
