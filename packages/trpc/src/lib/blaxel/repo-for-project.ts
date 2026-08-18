/**
 * Resolves a cloud project to its GitHub coordinates. Branch listing itself
 * runs through the local host's `gh` (the same path issue and PR lookups
 * take), so this deliberately does not call GitHub.
 */
import { db } from "@superset/db/client";
import { githubRepositories, v2Projects } from "@superset/db/schema";
import { parseGitHubRemote } from "@superset/shared/github-remote";
import { eq } from "drizzle-orm";

export interface ProjectRepo {
	owner: string;
	name: string;
	defaultBranch: string;
	/** Null when the repo isn't a known installation, so clones go unauthenticated. */
	repositoryId: string | null;
}

export async function repoForProject(
	projectId: string,
): Promise<ProjectRepo | null> {
	const project = await db.query.v2Projects.findFirst({
		where: eq(v2Projects.id, projectId),
	});
	if (!project) return null;

	if (project.githubRepositoryId) {
		const repo = await db.query.githubRepositories.findFirst({
			where: eq(githubRepositories.id, project.githubRepositoryId),
		});
		if (repo) {
			return {
				owner: repo.owner,
				name: repo.name,
				defaultBranch: repo.defaultBranch,
				repositoryId: repo.id,
			};
		}
	}

	// Projects can carry a clone URL without being linked to an installation
	// row — created before linking existed, or through the CLI. Match on the
	// remote so those still resolve rather than silently offering no branches.
	if (!project.repoCloneUrl) return null;
	const parsed = parseGitHubRemote(project.repoCloneUrl);
	if (!parsed) return null;

	const repo = await db.query.githubRepositories.findFirst({
		where: eq(githubRepositories.fullName, `${parsed.owner}/${parsed.name}`),
	});

	return {
		owner: parsed.owner,
		name: parsed.name,
		defaultBranch: repo?.defaultBranch ?? "main",
		repositoryId: repo?.id ?? null,
	};
}
