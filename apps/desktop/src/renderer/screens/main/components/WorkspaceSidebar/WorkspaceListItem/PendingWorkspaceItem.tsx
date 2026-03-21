import { Loader2Icon } from "lucide-react";
import { usePendingWorkspace } from "renderer/stores/new-workspace-modal";

interface PendingWorkspaceItemProps {
	isCollapsed?: boolean;
}

export function PendingWorkspaceItem({
	isCollapsed = false,
}: PendingWorkspaceItemProps) {
	const pendingWorkspace = usePendingWorkspace();

	if (!pendingWorkspace) return null;

	const statusLabel =
		pendingWorkspace.status === "generating-branch"
			? "Generating..."
			: pendingWorkspace.status === "preparing"
				? "Preparing..."
				: "Creating...";

	// Collapsed variant: icon-only with loader
	if (isCollapsed) {
		return (
			<div className="relative flex items-center justify-center w-full aspect-square rounded-md bg-muted/50 animate-pulse">
				<Loader2Icon className="size-4 animate-spin text-muted-foreground" />
			</div>
		);
	}

	// Expanded variant: full details
	return (
		<div className="group relative flex items-center gap-2 px-2 py-1.5 text-sm rounded-md bg-muted/50 animate-pulse">
			<div className="flex items-center gap-2 flex-1 min-w-0">
				<div className="size-1.5 rounded-full bg-blue-500 shrink-0" />
				<span className="truncate text-muted-foreground font-medium">
					{pendingWorkspace.name}
				</span>
			</div>
			<div className="flex items-center gap-1 text-muted-foreground shrink-0">
				<Loader2Icon className="size-3 animate-spin" />
				<span className="text-xs">{statusLabel}</span>
			</div>
		</div>
	);
}
