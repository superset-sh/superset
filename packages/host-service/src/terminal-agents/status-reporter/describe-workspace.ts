import { eq } from "drizzle-orm";
import type { HostDb } from "../../db";
import { projects, workspaces } from "../../db/schema";
import type { WorkspaceDescription } from "./status-reporter";

/** What the card needs to title a row: the workspace's name and its project. */
export function describeWorkspace(
	db: HostDb,
	workspaceId: string,
): WorkspaceDescription | null {
	const row = db
		.select({
			name: workspaces.name,
			projectId: workspaces.projectId,
			projectName: projects.name,
		})
		.from(workspaces)
		.leftJoin(projects, eq(projects.id, workspaces.projectId))
		.where(eq(workspaces.id, workspaceId))
		.get();
	if (!row) return null;
	return {
		name: row.name,
		...(row.projectId ? { projectId: row.projectId } : {}),
		...(row.projectName ? { projectName: row.projectName } : {}),
	};
}
