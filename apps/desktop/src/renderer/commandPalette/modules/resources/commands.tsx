import { HiOutlineCpuChip } from "react-icons/hi2";
import type { Command } from "../../core/types";

/**
 * Provided by the actions module (ordering within the Actions section); the
 * CHECK_RESOURCES hotkey and the native "Resources" menu item navigate to the
 * same page.
 */
export const checkResourcesCommand: Command = {
	id: "resources.check",
	title: "Check resources",
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
	run: (context) => context.navigate("/usage/resources"),
};
