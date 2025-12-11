import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { LuFolder, LuFolderTree } from "react-icons/lu";
import type { ChangesViewMode } from "../../types";

interface ViewModeToggleProps {
	viewMode: ChangesViewMode;
	onViewModeChange: (mode: ChangesViewMode) => void;
}

export function ViewModeToggle({
	viewMode,
	onViewModeChange,
}: ViewModeToggleProps) {
	const handleToggle = () => {
		onViewModeChange(viewMode === "grouped" ? "tree" : "grouped");
	};

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					onClick={handleToggle}
					className="h-7 w-7 p-0"
					aria-label={viewMode === "grouped" ? "Grouped view" : "Tree view"}
				>
					{viewMode === "grouped" ? (
						<LuFolder className="w-4 h-4" />
					) : (
						<LuFolderTree className="w-4 h-4" />
					)}
				</Button>
			</TooltipTrigger>
			<TooltipContent side="bottom" showArrow={false}>
				{viewMode === "grouped"
					? "Switch to tree view"
					: "Switch to grouped view"}
			</TooltipContent>
		</Tooltip>
	);
}
