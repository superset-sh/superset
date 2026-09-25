import type { ReactNode } from "react";
import {
	VscCopy,
	VscDiffAdded,
	VscDiffModified,
	VscDiffRemoved,
	VscDiffRenamed,
} from "react-icons/vsc";

export type FileStatus =
	| "added"
	| "copied"
	| "changed"
	| "deleted"
	| "modified"
	| "renamed"
	| "untracked";

const STATUS_COLORS: Record<FileStatus, string> = {
	added: "text-green-700 dark:text-green-400",
	copied: "text-purple-700 dark:text-purple-400",
	changed: "text-yellow-600 dark:text-yellow-400",
	deleted: "text-red-700 dark:text-red-500",
	modified: "text-yellow-600 dark:text-yellow-400",
	renamed: "text-blue-600 dark:text-blue-400",
	untracked: "text-green-700 dark:text-green-400",
};

function getStatusIcon(status: FileStatus, iconClass: string): ReactNode {
	switch (status) {
		case "added":
		case "untracked":
			return <VscDiffAdded className={iconClass} />;
		case "modified":
		case "changed":
			return <VscDiffModified className={iconClass} />;
		case "deleted":
			return <VscDiffRemoved className={iconClass} />;
		case "renamed":
			return <VscDiffRenamed className={iconClass} />;
		case "copied":
			return <VscCopy className={iconClass} />;
		default:
			return null;
	}
}

export function StatusIndicator({
	status,
	className,
	iconClassName = "w-3 h-3",
}: {
	status: string;
	className?: string;
	iconClassName?: string;
}) {
	return (
		<span
			className={`flex shrink-0 items-center ${STATUS_COLORS[status as FileStatus] ?? ""} ${className ?? ""}`}
		>
			{getStatusIcon(status as FileStatus, iconClassName)}
		</span>
	);
}
