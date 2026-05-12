import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { Folder, ListTree } from "lucide-react";
import type { ChangesViewMode } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";

interface ViewModeToggleProps {
	viewMode: ChangesViewMode;
	onChange: (next: ChangesViewMode) => void;
}

/**
 * Two-button segmented toggle: folders (flat by parent folder) vs tree
 * (full directory hierarchy).
 */
export function ViewModeToggle({ viewMode, onChange }: ViewModeToggleProps) {
	return (
		<div className="flex items-center rounded-sm">
			<ToggleButton
				icon={Folder}
				label="Folders"
				active={viewMode === "folders"}
				onClick={() => onChange("folders")}
			/>
			<ToggleButton
				icon={ListTree}
				label="Tree"
				active={viewMode === "tree"}
				onClick={() => onChange("tree")}
			/>
		</div>
	);
}

interface ToggleButtonProps {
	icon: React.ComponentType<{ className?: string }>;
	label: string;
	active: boolean;
	onClick: () => void;
}

function ToggleButton({
	icon: Icon,
	label,
	active,
	onClick,
}: ToggleButtonProps) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					onClick={onClick}
					aria-label={label}
					aria-pressed={active}
					className={cn(
						"flex size-5 items-center justify-center rounded-sm",
						active
							? "bg-accent text-foreground"
							: "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
					)}
				>
					<Icon className="size-3" />
				</button>
			</TooltipTrigger>
			<TooltipContent side="bottom">{label}</TooltipContent>
		</Tooltip>
	);
}
