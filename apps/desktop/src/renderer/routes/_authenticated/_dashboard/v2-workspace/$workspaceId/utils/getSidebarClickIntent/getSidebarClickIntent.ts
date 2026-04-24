import type { MouseEvent } from "react";

export type SidebarClickIntent = "openInEditor" | "openInNewTab" | "select";

export function getSidebarClickIntent(
	e: MouseEvent<unknown>,
): SidebarClickIntent {
	if (e.metaKey || e.ctrlKey) return "openInEditor";
	if (e.shiftKey) return "openInNewTab";
	return "select";
}
