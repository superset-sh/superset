import { cn } from "@superset/ui/utils";
import type { ChangedFile } from "shared/changes-types";

interface FileItemProps {
	file: ChangedFile;
	isSelected: boolean;
	onClick: () => void;
	showStats?: boolean;
}

function getStatusBadgeColor(status: string): string {
	switch (status) {
		case "added":
			return "text-green-600 dark:text-green-400";
		case "modified":
			return "text-yellow-600 dark:text-yellow-400";
		case "deleted":
			return "text-red-600 dark:text-red-400";
		case "renamed":
			return "text-blue-600 dark:text-blue-400";
		case "copied":
			return "text-purple-600 dark:text-purple-400";
		case "untracked":
			return "text-muted-foreground";
		default:
			return "text-muted-foreground";
	}
}

function getStatusIndicator(status: string): string {
	switch (status) {
		case "added":
			return "A";
		case "modified":
			return "M";
		case "deleted":
			return "D";
		case "renamed":
			return "R";
		case "copied":
			return "C";
		case "untracked":
			return "?";
		default:
			return "";
	}
}

function getFileName(path: string): string {
	return path.split("/").pop() || path;
}

export function FileItem({
	file,
	isSelected,
	onClick,
	showStats = true,
}: FileItemProps) {
	const fileName = getFileName(file.path);
	const statusBadgeColor = getStatusBadgeColor(file.status);
	const statusIndicator = getStatusIndicator(file.status);
	const showStatsDisplay = showStats && (file.additions > 0 || file.deletions > 0);

	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"w-full flex items-center gap-1.5 px-2 py-1.5 text-left rounded-sm",
				"hover:bg-accent/50 cursor-pointer transition-colors overflow-hidden",
				isSelected && "bg-accent",
			)}
		>
			{/* File name - truncates aggressively to make room for stats/badge */}
			<span className="flex-1 min-w-0 text-xs truncate overflow-hidden text-ellipsis">
				{fileName}
			</span>

			{/* Stats - GitHub style: always show "+X -Y" format */}
			{showStatsDisplay && (
				<div className="flex items-center gap-0.5 text-xs font-mono shrink-0 whitespace-nowrap">
					<span className="text-green-600 dark:text-green-400">
						+{file.additions}
					</span>
					<span className="text-red-600 dark:text-red-400">
						-{file.deletions}
					</span>
				</div>
			)}

			{/* Status badge - minimal GitHub style */}
			<span
				className={cn(
					"text-xs font-mono shrink-0 whitespace-nowrap",
					statusBadgeColor,
				)}
			>
				{statusIndicator}
			</span>
		</button>
	);
}
