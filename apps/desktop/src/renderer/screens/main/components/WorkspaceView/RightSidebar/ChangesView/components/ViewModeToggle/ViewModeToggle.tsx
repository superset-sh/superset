import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { VscListFlat, VscListTree } from "react-icons/vsc";
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
					aria-label={
						viewMode === "grouped"
							? "Switch to tree view"
							: "Switch to grouped view"
					}
				>
					{viewMode === "grouped" ? (
						<VscListTree className="size-3.5" />
					) : (
						<VscListFlat className="size-3.5" />
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
