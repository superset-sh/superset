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
						message: "Tab per command",
					}),
				)
			: i18n._(
					msg({
						message: "New tab",
					}),
				);
	}

	if (modeValue === "new-tab-split-pane") {
		return hasMultipleCommands
			? i18n._(
					msg({
						message: "New tab + panes",
					}),
				)
			: i18n._(
					msg({
						message: "New tab",
					}),
				);
	}

	if (modeValue === "sequential") {
		return hasMultipleCommands
			? i18n._(
					msg({
						message: "All in current tab",
					}),
				)
			: i18n._(
					msg({
						message: "Current tab",
					}),
				);
	}

	return hasMultipleCommands
		? i18n._(
				msg({
					message: "Single tab + panes",
				}),
			)
		: i18n._(
				msg({
					message: "Split pane",
				}),
			);
}
