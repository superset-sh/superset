import { msg } from "@lingui/core/macro";
import { BookOpenIcon, HistoryIcon, SettingsIcon } from "lucide-react";
import { LuLayers } from "react-icons/lu";
import type { Command, CommandProvider } from "../../core/types";
import { RecentlyViewedFrame } from "../../ui/RecentlyViewed/RecentlyViewedFrame";
import { WorkspaceListFrame } from "../../ui/WorkspaceList";
import { settingsTabCommands } from "../settings/commands";

export const navigationProvider: CommandProvider = {
	id: "navigation",
	provide: () => {
		const commands: Command[] = [
			{
				id: "nav.settings",
				title: msg({ message: "Settings" }),
				section: "navigation",
				icon: SettingsIcon,
				hotkeyId: "OPEN_SETTINGS",
				children: settingsTabCommands,
				run: (ctx) => ctx.navigate("/settings/account"),
			},
			{
				id: "nav.recentlyViewed",
				title: msg({
					message: "Recently Viewed",
				}),
				section: "navigation",
				icon: HistoryIcon,
				keywords: ["history", "recent", "back"],
				renderFrame: () => <RecentlyViewedFrame />,
			},
			{
				id: "nav.workspaces",
				title: msg({
					message: "Workspaces",
				}),
				section: "navigation",
				icon: LuLayers,
				keywords: ["workspace", "project", "repo", "repository", "switch"],
				renderFrame: () => <WorkspaceListFrame />,
			},
			{
				id: "nav.docs",
				title: msg({
					message: "Open documentation",
				}),
				section: "navigation",
				icon: BookOpenIcon,
				keywords: ["docs", "help"],
				run: () => {
					window.open("https://docs.superset.sh", "_blank", "noreferrer");
				},
			},
		];

		return commands;
	},
};
