import { HiOutlineCpuChip } from "react-icons/hi2";
import type { Command } from "../../core/types";
import { ResourcesFrame } from "../../ui/ResourcesFrame";

/**
 * Provided by the actions module (ordering within the Actions section);
 * also pushed directly by the CHECK_RESOURCES hotkey.
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
	renderFrame: () => <ResourcesFrame />,
};
