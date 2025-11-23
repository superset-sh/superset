import { HiMiniCodeBracket, HiMiniListBullet } from "react-icons/hi2";
import type { SidebarMode } from "./types";

export const modeIcons: Record<SidebarMode, typeof HiMiniListBullet> = {
	tabs: HiMiniListBullet,
	changes: HiMiniCodeBracket,
};

export const modeLabels: Record<SidebarMode, string> = {
	tabs: "Tabs",
	changes: "Changes",
};
