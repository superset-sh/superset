import { create } from "zustand";
import type { SplitPosition } from "../../../../../types";

export type PanelDropTarget = SplitPosition | "center";

interface DropPreviewState {
	/** Panel currently under the dragged tab, or null when none */
	targetPanelId: string | null;
	/** Zone within that panel (edge = split, center = move) */
	target: PanelDropTarget | null;
	setPreview: (targetPanelId: string, target: PanelDropTarget) => void;
	/** Clear only if the preview still points at `panelId` (avoids drag races) */
	clearPreview: (panelId: string) => void;
}

/**
 * Shared hover state so the workspace-level `DropPreviewOverlay` knows which
 * panel + zone a tab is being dragged over. Only one drag happens at a time,
 * so a module-level store is sufficient.
 */
export const useDropPreviewStore = create<DropPreviewState>((set) => ({
	targetPanelId: null,
	target: null,
	setPreview: (targetPanelId, target) => set({ targetPanelId, target }),
	clearPreview: (panelId) =>
		set((s) =>
			s.targetPanelId === panelId ? { targetPanelId: null, target: null } : s,
		),
}));
