import { statSync } from "node:fs";
import { TRPCError } from "@trpc/server";
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

// A project directory deleted or moved outside the app is a routine
// lifecycle state, not a bug — classify it here so simple-git's construct
// error can't escape a workspace-creation procedure as a reportable 500.
export function requireProjectRepoPath(localProject: LocalProject): string {
	if (
		!statSync(localProject.repoPath, { throwIfNoEntry: false })?.isDirectory()
	) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Project directory is no longer a directory on disk",
			cause: { kind: "PROJECT_DIR_MISSING", repoPath: localProject.repoPath },
		});
	}
	return localProject.repoPath;
}
