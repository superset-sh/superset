import { useLingui } from "@lingui/react/macro";
import type { TaskPriority } from "@superset/db/enums";

export function usePriorityLabels(): Record<TaskPriority, string> {
	const { t } = useLingui();
	return {
		none: t({ message: "No priority" }),
		urgent: t({ message: "Urgent" }),
		high: t({ message: "High" }),
		medium: t({ message: "Medium" }),
		low: t({ message: "Low" }),
	};
}
