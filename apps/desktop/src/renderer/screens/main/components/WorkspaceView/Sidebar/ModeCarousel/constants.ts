import type { HiMiniListBullet } from "react-icons/hi2";
import { LuGitCompareArrows, LuTerminal } from "react-icons/lu";
import type { SidebarMode } from "./types";

export const modeIcons: Record<SidebarMode, typeof HiMiniListBullet> = {
	tabs: LuTerminal,
	changes: LuGitCompareArrows,
};

export const modeLabels: Record<SidebarMode, string> = {
	tabs: "Tabs",
	changes: "Changes",
};
