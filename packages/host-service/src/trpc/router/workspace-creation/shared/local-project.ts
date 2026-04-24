import { eq } from "drizzle-orm";
import { projects } from "../../../../db/schema";
import type { HostServiceContext } from "../../../../types";
import { projectNotSetupError } from "./project-helpers";

export type LocalProject = typeof projects.$inferSelect;

export function findLocalProject(
	ctx: HostServiceContext,
	projectId: string,
): LocalProject | undefined {
	return ctx.db.query.projects
		.findFirst({ where: eq(projects.id, projectId) })
		.sync();
}

export function requireLocalProject(
	ctx: HostServiceContext,
	projectId: string,
): LocalProject {
	const localProject = findLocalProject(ctx, projectId);
	if (!localProject) {
		throw projectNotSetupError(projectId);
	}
	return localProject;
}
