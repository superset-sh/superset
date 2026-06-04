import type { PaneActionConfig } from "@superset/panes";
import { useMemo } from "react";
import { HiMiniXMark } from "react-icons/hi2";
import { TbLayoutColumns, TbLayoutRows } from "react-icons/tb";
import { HotkeyLabel } from "renderer/hotkeys";
import type { PaneViewerData, TerminalPaneData } from "../../types";
import type { TerminalLauncher } from "../useV2TerminalLauncher";

export function useDefaultPaneActions({
	launcher,
}: {
	launcher: TerminalLauncher;
}): PaneActionConfig<PaneViewerData>[] {
	return useMemo<PaneActionConfig<PaneViewerData>[]>(
		() => [
			{
				key: "split",
				icon: (ctx) =>
					ctx.pane.parentDirection === "horizontal" ? (
						<TbLayoutRows className="size-3.5" />
					) : (
						<TbLayoutColumns className="size-3.5" />
					),
				tooltip: <HotkeyLabel label="Split pane" id="SPLIT_AUTO" />,
				onClick: async (ctx) => {
					const position =
						ctx.pane.parentDirection === "horizontal" ? "down" : "right";
					const terminalId = await launcher.create();
					ctx.actions.split(position, {
						kind: "terminal",
						data: { terminalId } as TerminalPaneData,
					});
				},
			},
			{
				key: "close",
				icon: <HiMiniXMark className="size-3.5" />,
				tooltip: <HotkeyLabel label="Close pane" id="CLOSE_PANE" />,
				onClick: (ctx) => ctx.actions.close(),
			},
		],
		[launcher],
	);
}
