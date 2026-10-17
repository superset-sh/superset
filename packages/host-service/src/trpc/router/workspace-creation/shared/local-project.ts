import { statSync } from "node:fs";
import { TRPCError } from "@trpc/server";
import { and, eq, isNull, ne } from "drizzle-orm";
import { projects } from "../../../../db/schema";
import type { HostServiceContext } from "../../../../types";
import type { ProjectDirMissingCause } from "../../../error-types";
import { projectNotSetupError } from "./project-helpers";
import { resolveProjectWorktreesFolder } from "./worktree-paths";

export type LocalProject = typeof projects.$inferSelect;

export function findLocalProject(
	ctx: HostServiceContext,
	projectId: string,
): LocalProject | undefined {
	return ctx.db.query.projects
		.findFirst({
			where: and(eq(projects.id, projectId), isNull(projects.deletedAt)),
		})
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

export function getProjectWorktreesFolder(
	ctx: HostServiceContext,
	localProject: Pick<LocalProject, "id" | "name">,
): string {
	const otherProjects = ctx.db
		.select({ name: projects.name })
		.from(projects)
		.where(ne(projects.id, localProject.id))
		.all();
	return resolveProjectWorktreesFolder(
		localProject,
		otherProjects.map((project) => project.name),
	);
}

// A project directory deleted or moved outside the app is a routine
// lifecycle state, not a bug — classify it here so simple-git's construct
// error can't escape a workspace-creation procedure as a reportable 500.
export function isProjectDirPresent(repoPath: string): boolean {
	return statSync(repoPath, { throwIfNoEntry: false })?.isDirectory() ?? false;
}

export function requireProjectRepoPath(localProject: LocalProject): string {
	if (!isProjectDirPresent(localProject.repoPath)) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Project directory is no longer a directory on disk",
			cause: {
				kind: "PROJECT_DIR_MISSING",
				repoPath: localProject.repoPath,
			} satisfies ProjectDirMissingCause,
		});
	}
	return localProject.repoPath;
}
