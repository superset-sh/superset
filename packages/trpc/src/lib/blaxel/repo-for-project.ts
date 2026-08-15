/**
 * Resolves a cloud project to its GitHub coordinates. Branch listing itself
 * runs through the local host's `gh` (the same path issue and PR lookups
 * take), so this deliberately does not call GitHub.
 */
import { db } from "@superset/db/client";
import { githubRepositories, v2Projects } from "@superset/db/schema";
import { eq } from "drizzle-orm";

export interface ProjectRepo {
	owner: string;
	name: string;
	defaultBranch: string;
}

export async function repoForProject(
	projectId: string,
): Promise<ProjectRepo | null> {
	const project = await db.query.v2Projects.findFirst({
		where: eq(v2Projects.id, projectId),
	});
	if (!project?.githubRepositoryId) return null;

	const repo = await db.query.githubRepositories.findFirst({
		where: eq(githubRepositories.id, project.githubRepositoryId),
	});
	if (!repo) return null;

	return {
		owner: repo.owner,
		name: repo.name,
		defaultBranch: repo.defaultBranch,
	};
}
