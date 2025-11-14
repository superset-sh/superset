import { GitBranch, LayoutList } from "lucide-react";
import type { SidebarMode } from "./types";

export const modeIcons: Record<SidebarMode, typeof LayoutList> = {
	tabs: LayoutList,
	changes: GitBranch,
};

export const modeLabels: Record<SidebarMode, string> = {
	tabs: "Tabs",
	changes: "Changes",
};

