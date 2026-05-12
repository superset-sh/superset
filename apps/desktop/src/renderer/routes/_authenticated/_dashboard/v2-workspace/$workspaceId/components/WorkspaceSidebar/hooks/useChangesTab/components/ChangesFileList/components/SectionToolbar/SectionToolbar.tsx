import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { FoldVertical, UnfoldVertical } from "lucide-react";

interface SectionToolbarProps {
	onCollapseAll: () => void;
	onExpandAll: () => void;
}

/**
 * Thin action row that sits under a changes section header (below the
 * title/count, above the file list/tree) — the changes-sidebar analog of
 * `FilesTab`'s header button strip. Currently just collapse-all / expand-all.
 */
export function SectionToolbar({
	onCollapseAll,
	onExpandAll,
}: SectionToolbarProps) {
	return (
		<div className="flex items-center justify-end gap-0.5 px-1.5 py-0.5">
			<ToolbarButton
				icon={UnfoldVertical}
				label="Expand all"
				onClick={onExpandAll}
			/>
			<ToolbarButton
				icon={FoldVertical}
				label="Collapse all"
				onClick={onCollapseAll}
			/>
		</div>
	);
}

interface ToolbarButtonProps {
	icon: React.ComponentType<{ className?: string }>;
	label: string;
	onClick: () => void;
}

function ToolbarButton({ icon: Icon, label, onClick }: ToolbarButtonProps) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="size-5 text-muted-foreground hover:text-foreground"
					onClick={onClick}
					aria-label={label}
				>
					<Icon className="size-3" />
				</Button>
			</TooltipTrigger>
			<TooltipContent side="bottom">{label}</TooltipContent>
		</Tooltip>
	);
}
