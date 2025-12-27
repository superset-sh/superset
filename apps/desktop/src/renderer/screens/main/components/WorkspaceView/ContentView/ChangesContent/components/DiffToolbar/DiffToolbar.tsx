import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@superset/ui/toggle-group";
import {
	HiMiniArrowsRightLeft,
	HiMiniListBullet,
	HiMiniMinus,
	HiMiniPencil,
	HiMiniPlus,
	HiMiniTrash,
} from "react-icons/hi2";
import type { ChangeCategory, DiffViewMode } from "shared/changes-types";

interface DiffToolbarProps {
	viewMode: DiffViewMode;
	onViewModeChange: (mode: DiffViewMode) => void;
	category: ChangeCategory;
	onStage?: () => void;
	onUnstage?: () => void;
	onDiscard?: () => void;
	isActioning?: boolean;
	isEditable?: boolean;
	isSaving?: boolean;
}

export function DiffToolbar({
	viewMode,
	onViewModeChange,
	category,
	onStage,
	onUnstage,
	onDiscard,
	isActioning = false,
	isEditable = false,
	isSaving = false,
}: DiffToolbarProps) {
	const canStage = category === "unstaged";
	const canUnstage = category === "staged";
	const canDiscard = category === "unstaged";

	return (
		<div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
			<div className="flex items-center gap-3">
				<ToggleGroup
					type="single"
					value={viewMode}
					onValueChange={(value) => {
						if (value) onViewModeChange(value as DiffViewMode);
					}}
					variant="outline"
					size="sm"
				>
					<ToggleGroupItem value="side-by-side" aria-label="Side by side view">
						<HiMiniArrowsRightLeft className="w-4 h-4 mr-1.5" />
						Side by Side
					</ToggleGroupItem>
					<ToggleGroupItem value="inline" aria-label="Inline view">
						<HiMiniListBullet className="w-4 h-4 mr-1.5" />
						Inline
					</ToggleGroupItem>
				</ToggleGroup>

				{isEditable && (
					<Badge variant="secondary" className="gap-1 text-xs">
						<HiMiniPencil className="w-3 h-3" />
						{isSaving ? "Saving..." : "Editable"}
						<span className="text-muted-foreground ml-1">⌘S to save</span>
					</Badge>
				)}
			</div>

			<div className="flex items-center gap-2">
				{canStage && onStage && (
					<Button
						variant="outline"
						size="sm"
						onClick={onStage}
						disabled={isActioning}
					>
						<HiMiniPlus className="w-4 h-4 mr-1.5" />
						Stage
					</Button>
				)}
				{canUnstage && onUnstage && (
					<Button
						variant="outline"
						size="sm"
						onClick={onUnstage}
						disabled={isActioning}
					>
						<HiMiniMinus className="w-4 h-4 mr-1.5" />
						Unstage
					</Button>
				)}
				{canDiscard && onDiscard && (
					<Button
						variant="outline"
						size="sm"
						onClick={onDiscard}
						disabled={isActioning}
						className="text-destructive hover:text-destructive"
					>
						<HiMiniTrash className="w-4 h-4 mr-1.5" />
						Discard
					</Button>
				)}
			</div>
		</div>
	);
}
