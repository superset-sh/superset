/**
 * The repository every cloud workspace clones. Environments cannot carry
 * repositories yet, so there is one for all of them and nothing per-workspace
 * to resolve — which is why a cloud workspace has no project.
 */
import { db } from "@superset/db/client";
import { githubRepositories } from "@superset/db/schema";
import { CLOUD_WORKSPACE_REPO } from "@superset/shared/constants";
import { and, eq } from "drizzle-orm";

export interface CloudRepo {
	owner: string;
	name: string;
	defaultBranch: string;
	/** Null when the repo isn't a known installation, so clones go unauthenticated. */
	repositoryId: string | null;
}

export async function cloudRepo(): Promise<CloudRepo | null> {
	const row = await db.query.githubRepositories.findFirst({
		where: and(
			eq(githubRepositories.owner, CLOUD_WORKSPACE_REPO.owner),
			eq(githubRepositories.name, CLOUD_WORKSPACE_REPO.name),
		),
	});
	if (!row) return null;
	return {
		owner: row.owner,
		name: row.name,
		defaultBranch: row.defaultBranch,
		repositoryId: row.id,
	};
}
