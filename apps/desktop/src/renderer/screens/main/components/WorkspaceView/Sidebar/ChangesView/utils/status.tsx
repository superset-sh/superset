import type { ReactNode } from "react";
import {
	LuCopy,
	LuFileOutput,
	LuPencilLine,
	LuPlus,
	LuX,
} from "react-icons/lu";
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
			return <LuPlus className={iconClass} />;
		case "modified":
			return <LuPencilLine className={iconClass} />;
		case "deleted":
			return <LuX className={iconClass} />;
		case "renamed":
			return <LuFileOutput className={iconClass} />;
		case "copied":
			return <LuCopy className={iconClass} />;
		default:
			return null;
	}
}
