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
			return "text-success";
		case "modified":
			return "text-warning";
		case "deleted":
			return "text-destructive";
		case "renamed":
			return "text-primary";
		case "copied":
			return "text-status-1";
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
