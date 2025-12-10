import { cn } from "@superset/ui/utils";
import type { ChangedFile } from "shared/changes-types";

interface FileItemProps {
	file: ChangedFile;
	isSelected: boolean;
	onClick: () => void;
	showStats?: boolean;
}

function getStatusColor(status: string): string {
	switch (status) {
		case "added":
			return "text-green-500";
		case "modified":
			return "text-yellow-500";
		case "deleted":
			return "text-red-500";
		case "renamed":
			return "text-blue-500";
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
	const statusColor = getStatusColor(file.status);
	const statusIndicator = getStatusIndicator(file.status);
	const hasStats = showStats && (file.additions > 0 || file.deletions > 0);

	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"w-full flex items-center gap-2 px-2 py-1.5 text-left rounded-sm",
				"hover:bg-accent/50 cursor-pointer transition-colors",
				isSelected && "bg-accent",
			)}
		>
			{/* Status indicator */}
			<span className={cn("text-xs font-mono w-4 flex-shrink-0", statusColor)}>
				{statusIndicator}
			</span>

			{/* File name */}
			<span className="flex-1 min-w-0 text-sm truncate">{fileName}</span>

			{/* Stats */}
			{hasStats && (
				<div className="flex items-center gap-1 text-xs flex-shrink-0">
					{file.additions > 0 && (
						<span className="text-green-500">+{file.additions}</span>
					)}
					{file.deletions > 0 && (
						<span className="text-red-500">-{file.deletions}</span>
					)}
				</div>
			)}
		</button>
	);
}
