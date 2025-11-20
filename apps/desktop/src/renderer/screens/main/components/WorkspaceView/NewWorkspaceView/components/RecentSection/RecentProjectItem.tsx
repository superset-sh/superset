import { Folder, X } from "lucide-react";
import { Button } from "@superset/ui/button";
import type { RecentProject } from "shared/types";

interface RecentProjectItemProps {
	project: RecentProject;
	onOpen: (path: string) => void;
	onRemove: (path: string) => void;
}

function formatTimestamp(timestamp: number): string {
	const now = Date.now();
	const diff = now - timestamp;

	const seconds = Math.floor(diff / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);

	if (days > 0) {
		return days === 1 ? "Yesterday" : `${days} days ago`;
	}
	if (hours > 0) {
		return `${hours} hour${hours > 1 ? "s" : ""} ago`;
	}
	if (minutes > 0) {
		return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
	}
	return "Just now";
}

export function RecentProjectItem({
	project,
	onOpen,
	onRemove,
}: RecentProjectItemProps) {
	return (
		<button
			type="button"
			className="group w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent transition-colors text-left"
			onClick={() => onOpen(project.path)}
		>
			<Folder className="h-4 w-4 text-muted-foreground flex-shrink-0" />
			<div className="flex-1 min-w-0">
				<div className="text-sm font-medium text-foreground truncate">
					{project.name}
				</div>
				<div className="text-xs text-muted-foreground truncate">
					{project.path}
				</div>
			</div>
			<div className="flex items-center gap-2 flex-shrink-0">
				<span className="text-xs text-muted-foreground">
					{formatTimestamp(project.lastOpened)}
				</span>
				<Button
					variant="ghost"
					size="icon"
					className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
					onClick={(e) => {
						e.stopPropagation();
						onRemove(project.path);
					}}
				>
					<X className="h-3 w-3" />
				</Button>
			</div>
		</button>
	);
}
