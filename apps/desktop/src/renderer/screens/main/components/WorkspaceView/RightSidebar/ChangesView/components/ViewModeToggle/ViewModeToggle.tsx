import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { LuFolderTree, LuList } from "react-icons/lu";
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
					className="size-6 p-0"
					aria-label={viewMode === "grouped" ? "Grouped view" : "Tree view"}
				>
					{viewMode === "grouped" ? (
						<LuList className="size-3.5" />
					) : (
						<LuFolderTree className="size-3.5" />
					)}
				</Button>
			</TooltipTrigger>
			<TooltipContent side="top" showArrow={false}>
				{viewMode === "grouped"
					? "Switch to tree view"
					: "Switch to grouped view"}
			</TooltipContent>
		</Tooltip>
	);
}
