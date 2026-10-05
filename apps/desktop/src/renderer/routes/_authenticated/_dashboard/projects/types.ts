import type { TaskProjectState } from "@superset/db/schema";

export interface ProjectsSearch {
	status?: TaskProjectState[];
	leads?: string[];
}
