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
	added: "text-success",
	copied: "text-status-1",
	changed: "text-warning",
	deleted: "text-destructive",
	modified: "text-warning",
	renamed: "text-primary",
	untracked: "text-success",
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
