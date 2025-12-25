import type { SelectTask } from "@superset/db/schema";

type Priority = SelectTask["priority"];

export function mapLinearPriority(linearPriority: number): Priority {
	switch (linearPriority) {
		case 1:
			return "urgent";
		case 2:
			return "high";
		case 3:
			return "medium";
		case 4:
			return "low";
		default:
			return "none";
	}
}
