import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { Folder, ListTree } from "lucide-react";
import type { ChangesViewMode } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";

interface ViewModeToggleProps {
	viewMode: ChangesViewMode;
	onChange: (next: ChangesViewMode) => void;
}

/**
 * Single toggle between folders (flat by parent folder) and tree (full
 * directory hierarchy) views. Shows the mode it will switch to.
 */
export function ViewModeToggle({ viewMode, onChange }: ViewModeToggleProps) {
	const next: ChangesViewMode = viewMode === "folders" ? "tree" : "folders";
	const label = next === "tree" ? "Tree view" : "Folder view";
	const Icon = next === "tree" ? ListTree : Folder;
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="size-7 text-muted-foreground hover:text-foreground"
					onClick={() => onChange(next)}
					aria-label={label}
				>
					<Icon className="size-3.5" />
				</Button>
			</TooltipTrigger>
			<TooltipContent side="bottom">{label}</TooltipContent>
		</Tooltip>
	);
}
