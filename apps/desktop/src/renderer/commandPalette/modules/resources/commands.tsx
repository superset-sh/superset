import { msg } from "@lingui/core/macro";
import { HiOutlineChartBar, HiOutlineCpuChip } from "react-icons/hi2";
import {
	getUsageLastSection,
	usageSectionPath,
} from "renderer/routes/_authenticated/settings/usage/utils/usageLastSection";
import type { Command } from "../../core/types";

/**
 * Provided by the actions module (ordering within the Actions section).
 * Usage lives under Settings, so a settings-tab entry for it exists too, but
 * that's only reachable by first drilling into "Settings" — the command
 * palette doesn't flatten `children` into top-level search. This is the
 * direct, one-step way in, reopening whichever section (token usage /
 * machine resources) was visited last — same behavior the removed sidebar
 * rail button had.
 */
export const openUsageCommand: Command = {
	id: "usage.open",
	title: msg({ id: "commandPalette.resources.usage", message: "Usage" }),
	section: "actions",
	icon: HiOutlineChartBar,
	keywords: [
		"usage",
		"tokens",
		"spend",
		"cost",
		"quota",
		"plan",
		"billing",
		"claude",
		"codex",
		"model",
	],
	run: (context) => context.navigate(usageSectionPath(getUsageLastSection())),
};

/**
 * Provided by the actions module (ordering within the Actions section); the
 * CHECK_RESOURCES hotkey and the native "Resources" menu item navigate to the
 * same page.
 */
export const checkResourcesCommand: Command = {
	id: "resources.check",
	title: msg({
		id: "commandPalette.resources.checkResources",
		message: "Check resources",
	}),
	section: "actions",
	icon: HiOutlineCpuChip,
	hotkeyId: "CHECK_RESOURCES",
	keywords: [
		"resources",
		"memory",
		"cpu",
		"ram",
		"usage",
		"performance",
		"monitor",
		"activity",
		"processes",
	],
	run: (context) => context.navigate("/settings/usage/resources"),
};
