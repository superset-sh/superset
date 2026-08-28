import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import type { ExecutionMode } from "@superset/local-db/schema/zod";

export function getPresetModeLabel(
	modeValue: ExecutionMode,
	commandCount: number,
): string {
	const hasMultipleCommands = commandCount > 1;

	if (modeValue === "new-tab") {
		return hasMultipleCommands
			? i18n._(
					msg({
						id: "settings.terminal.presetMode.tabPerCommand",
						message: "Tab per command",
					}),
				)
			: i18n._(
					msg({
						id: "settings.terminal.presetMode.newTab",
						message: "New tab",
					}),
				);
	}

	if (modeValue === "new-tab-split-pane") {
		return hasMultipleCommands
			? i18n._(
					msg({
						id: "settings.terminal.presetMode.newTabPanes",
						message: "New tab + panes",
					}),
				)
			: i18n._(
					msg({
						id: "settings.terminal.presetMode.newTabSplit",
						message: "New tab",
					}),
				);
	}

	if (modeValue === "sequential") {
		return hasMultipleCommands
			? i18n._(
					msg({
						id: "settings.terminal.presetMode.allInCurrentTab",
						message: "All in current tab",
					}),
				)
			: i18n._(
					msg({
						id: "settings.terminal.presetMode.currentTab",
						message: "Current tab",
					}),
				);
	}

	return hasMultipleCommands
		? i18n._(
				msg({
					id: "settings.terminal.presetMode.singleTabPanes",
					message: "Single tab + panes",
				}),
			)
		: i18n._(
				msg({
					id: "settings.terminal.presetMode.splitPane",
					message: "Split pane",
				}),
			);
}
