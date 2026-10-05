import type { TaskProjectState } from "@superset/db/schema";

export const PROJECT_STATES: TaskProjectState[] = [
	"planned",
	"started",
	"paused",
	"completed",
	"canceled",
];
