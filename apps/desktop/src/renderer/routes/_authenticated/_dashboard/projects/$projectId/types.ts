import type { RouterOutputs } from "@superset/trpc";

export type ProjectRecord = RouterOutputs["taskProject"]["get"];

export type ProjectTab = "overview" | "progress";

export interface ProjectRecordChanges {
	name?: string;
	description?: string | null;
	icon?: string | null;
	color?: string | null;
	state?: ProjectRecord["state"];
	leadUserId?: string | null;
	startDate?: string | null;
	targetDate?: string | null;
}
