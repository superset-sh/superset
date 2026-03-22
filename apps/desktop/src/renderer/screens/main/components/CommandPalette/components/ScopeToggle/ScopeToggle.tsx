import { cn } from "@superset/ui/utils";
import type { SearchScope } from "renderer/stores/search-dialog-state";

interface ScopeToggleProps {
	scope: SearchScope;
	onScopeChange: (scope: SearchScope) => void;
	workspaceName?: string;
}

export function ScopeToggle({
	scope,
	onScopeChange,
	workspaceName,
}: ScopeToggleProps) {
	return (
		<div className="flex items-center gap-1 border-b px-3 py-1.5">
			<button
				type="button"
				aria-pressed={scope === "workspace"}
				onClick={() => onScopeChange("workspace")}
				className={cn(
					"px-2 py-0.5 rounded text-xs transition-colors truncate max-w-[200px]",
					scope === "workspace"
						? "bg-muted text-foreground"
						: "text-muted-foreground hover:text-foreground",
				)}
			>
				{workspaceName || "This workspace"}
			</button>
			<button
				type="button"
				aria-pressed={scope === "global"}
				onClick={() => onScopeChange("global")}
				className={cn(
					"px-2 py-0.5 rounded text-xs transition-colors",
					scope === "global"
						? "bg-muted text-foreground"
						: "text-muted-foreground hover:text-foreground",
				)}
			>
				All workspaces
			</button>
		</div>
	);
}
