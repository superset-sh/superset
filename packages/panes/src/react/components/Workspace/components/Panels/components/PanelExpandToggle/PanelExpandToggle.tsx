import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { Maximize2, Minimize2 } from "lucide-react";
import type { StoreApi } from "zustand/vanilla";
import type { WorkspaceStore } from "../../../../../../../core/store";
import { isPanelExpanded } from "../../../../../../../core/store/panels";
import type { LayoutNode } from "../../../../../../../types";

interface PanelExpandToggleProps<TData> {
	store: StoreApi<WorkspaceStore<TData>>;
	panelId: string;
	/** Current (derived) panel layout, used to reflect the expanded state */
	layout: LayoutNode;
}

/**
 * VS Code-style expand-group toggle: grows this panel to dominate the grid,
 * or restores even sizes when it's already expanded.
 */
export function PanelExpandToggle<TData>({
	store,
	panelId,
	layout,
}: PanelExpandToggleProps<TData>) {
	const expanded = isPanelExpanded(layout, panelId);
	const label = expanded ? "Even panel sizes" : "Expand panel";

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
					{expanded ? (
						<Minimize2 className="size-3.5" />
					) : (
						<Maximize2 className="size-3.5" />
					)}
				</Button>
			</TooltipTrigger>
			<TooltipContent side="bottom" showArrow={false}>
				{label}
			</TooltipContent>
		</Tooltip>
	);
}
