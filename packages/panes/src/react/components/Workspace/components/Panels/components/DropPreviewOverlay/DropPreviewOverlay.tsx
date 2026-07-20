import { useMemo } from "react";
import { useDragLayer } from "react-dnd";
import type { StoreApi } from "zustand/vanilla";
import type { WorkspaceStore } from "../../../../../../../core/store";
import {
	deriveWorkspacePanels,
	moveTabToPanel,
	splitPanelWithTab,
} from "../../../../../../../core/store/panels";
import { getPaneIdsInLayout } from "../../../../../../../core/store/utils";
import type { PanelLayoutNode } from "../../../../../../../types";
import { TAB_DRAG_TYPE } from "../../../TabBar/components/TabItem";
import { useDropPreviewStore } from "../../dropPreviewStore";
import { computePanelRects, type PanelRect } from "../../utils/layoutRects";

interface DropPreviewOverlayProps<TData> {
	store: StoreApi<WorkspaceStore<TData>>;
}

const asStyle = (r: PanelRect): React.CSSProperties => ({
	left: `${r.left}%`,
	top: `${r.top}%`,
	width: `${r.width}%`,
	height: `${r.height}%`,
});

/**
 * Ghost preview of the grid *after* the current drag drops. It runs the exact
 * pure drop logic (`splitPanelWithTab` / `moveTabToPanel`) against the live
 * store, then draws every resulting panel's rectangle — so the highlight shows
 * the true post-drop size and position (new panels join as equal shares), not
 * a fixed half-panel band.
 */
export function DropPreviewOverlay<TData>({
	store,
}: DropPreviewOverlayProps<TData>) {
	const draggedItem = useDragLayer((monitor) =>
		monitor.isDragging() && monitor.getItemType() === TAB_DRAG_TYPE
			? (monitor.getItem() as { tabId: string } | null)
			: null,
	);
	const targetPanelId = useDropPreviewStore((s) => s.targetPanelId);
	const target = useDropPreviewStore((s) => s.target);
	const tabId = draggedItem?.tabId ?? null;

	const preview = useMemo(() => {
		if (!tabId || !targetPanelId || !target) return null;
		const state = store.getState();
		const current = deriveWorkspacePanels(state);

		let resultingLayout: PanelLayoutNode = current.layout;
		let destinationPanelId = targetPanelId;

		if (target === "center") {
			// Tab joins the target panel; layout only shifts if the source panel
			// collapses. Either way the destination is the target panel.
			const result = moveTabToPanel(state, { tabId, targetPanelId });
			if (result) resultingLayout = result.panelLayout;
		} else {
			const result = splitPanelWithTab(state, {
				tabId,
				targetPanelId,
				position: target,
			});
			// Null = invalid split (e.g. a lone tab onto its own edge) → no preview
			if (!result) return null;
			resultingLayout = result.panelLayout;
			// The split mints a fresh panel id — it's the leaf that's new.
			const before = new Set(getPaneIdsInLayout(current.layout));
			destinationPanelId =
				getPaneIdsInLayout(resultingLayout).find((id) => !before.has(id)) ??
				targetPanelId;
		}

		const destination =
			computePanelRects(resultingLayout).get(destinationPanelId);
		return destination ?? null;
	}, [store, tabId, targetPanelId, target]);

	if (!preview) return null;

	return (
		<div className="pointer-events-none absolute inset-0 z-30">
			<div
				className="absolute rounded-sm border-2 border-primary/70 bg-primary/15 transition-all duration-100"
				style={asStyle(preview)}
			/>
		</div>
	);
}
