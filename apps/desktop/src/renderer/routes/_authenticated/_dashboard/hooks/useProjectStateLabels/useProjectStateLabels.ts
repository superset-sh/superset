import { useLingui } from "@lingui/react/macro";
import type { TaskProjectState } from "@superset/db/schema";

export function useProjectStateLabels(): Record<TaskProjectState, string> {
	const { t } = useLingui();
	return {
		planned: t({ message: "Planned", context: "project state" }),
		started: t({ message: "In progress", context: "project state" }),
		paused: t({ message: "Paused", context: "project state" }),
		completed: t({ message: "Completed", context: "project state" }),
		canceled: t({ message: "Canceled", context: "project state" }),
	};
}
