import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import {
	ChevronsLeftRight,
	ChevronsUpDown,
	Columns2,
	Rows2,
} from "lucide-react";
import type { StoreApi } from "zustand/vanilla";
import type { WorkspaceStore } from "../../../../../../../core/store";
import { isPanelExpanded } from "../../../../../../../core/store/panels";
import { getPaneParentDirection } from "../../../../../../../core/store/utils";
import type { PanelLayoutNode } from "../../../../../../../types";

interface PanelExpandToggleProps<TData> {
	store: StoreApi<WorkspaceStore<TData>>;
	panelId: string;
	/** Current (derived) panel layout, used to reflect the expanded state */
	layout: PanelLayoutNode;
}

/**
 * VS Code-style expand-group toggle. The icons mirror the panel's axis and
 * the action's result: outward chevrons grow this panel; the equal
 * columns/rows glyph restores even sizes.
 */
export function PanelExpandToggle<TData>({
	store,
	panelId,
	layout,
}: PanelExpandToggleProps<TData>) {
	const expanded = isPanelExpanded(layout, panelId);
	// Orient the glyphs to the panel's own split axis (side-by-side vs stacked)
	const isVertical = getPaneParentDirection(layout, panelId) === "vertical";
	const label = expanded ? "Equal panel sizes" : "Expand panel";

	const ExpandIcon = isVertical ? ChevronsUpDown : ChevronsLeftRight;
	const EqualizeIcon = isVertical ? Rows2 : Columns2;
	const Icon = expanded ? EqualizeIcon : ExpandIcon;

	return (
		<Tooltip delayDuration={500}>
			<TooltipTrigger asChild>
				<Button
					aria-label={label}
					className="size-7 text-muted-foreground hover:text-foreground"
					onClick={() => store.getState().toggleExpandPanel({ panelId })}
					size="icon"
					type="button"
					variant="ghost"
				>
					<Icon className="size-3.5" />
				</Button>
			</TooltipTrigger>
			<TooltipContent side="bottom" showArrow={false}>
				{label}
			</TooltipContent>
		</Tooltip>
	);
}
