import type { ReactNode } from "react";
import {
	VscCopy,
	VscDiffAdded,
	VscDiffModified,
	VscDiffRemoved,
	VscDiffRenamed,
} from "react-icons/vsc";
import type { FileStatus } from "shared/changes-types";

export function getStatusColor(status: FileStatus): string {
	switch (status) {
		case "added":
		case "untracked":
			return "text-green-600 dark:text-green-400";
		case "modified":
			return "text-yellow-600 dark:text-yellow-400";
		case "deleted":
			return "text-red-600 dark:text-red-400";
		case "renamed":
			return "text-blue-600 dark:text-blue-400";
		case "copied":
			return "text-purple-600 dark:text-purple-400";
		default:
			return "text-muted-foreground";
	}
}

export function getStatusIndicator(status: FileStatus): ReactNode {
	const iconClass = "w-3 h-3";
	switch (status) {
		case "added":
		case "untracked":
			return <VscDiffAdded className={iconClass} />;
		case "modified":
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
