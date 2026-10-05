import type { RouterOutputs } from "@superset/trpc";

export type TaskProjectRow = RouterOutputs["taskProject"]["list"][number];

export interface ProjectChanges {
	icon?: string | null;
	color?: string | null;
	state?: TaskProjectRow["state"];
	leadUserId?: string | null;
	targetDate?: string | null;
}
