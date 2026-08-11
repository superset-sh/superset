import type { DesktopNotice } from "@superset/shared/desktop-notices";
import { create } from "zustand";

interface DesktopNoticePreviewState {
	/** Dev-only override that forces a notice to render, bypassing the server
	 * fetch, targeting, and dismissal filter. Not persisted. */
	preview: DesktopNotice | null;
	setPreview: (notice: DesktopNotice | null) => void;
}

export const useDesktopNoticePreviewStore = create<DesktopNoticePreviewState>(
	(set) => ({
		preview: null,
		setPreview: (preview) => set({ preview }),
	}),
);
