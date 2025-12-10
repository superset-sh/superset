import { ToggleGroup, ToggleGroupItem } from "@superset/ui/toggle-group";
import { HiFolder, HiListBullet } from "react-icons/hi2";
import type { ChangesViewMode } from "../../types";

interface ViewModeToggleProps {
	viewMode: ChangesViewMode;
	onViewModeChange: (mode: ChangesViewMode) => void;
}

export function ViewModeToggle({
	viewMode,
	onViewModeChange,
}: ViewModeToggleProps) {
	return (
		<ToggleGroup
			type="single"
			value={viewMode}
			onValueChange={(value) => {
				if (value) onViewModeChange(value as ChangesViewMode);
			}}
			variant="outline"
			size="sm"
		>
			<ToggleGroupItem value="grouped" aria-label="Grouped view">
				<HiListBullet className="w-4 h-4" />
			</ToggleGroupItem>
			<ToggleGroupItem value="tree" aria-label="Tree view">
				<HiFolder className="w-4 h-4" />
			</ToggleGroupItem>
		</ToggleGroup>
	);
}
