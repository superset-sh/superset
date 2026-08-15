/**
 * Mints a GitHub App installation token for a project's repo.
 *
 * Installation tokens are repo-scoped and expire in about an hour, which is
 * what makes it acceptable for the token to enter the sandbox at all: an
 * agent running in there can read whatever the clone used, so the blast
 * radius of a leak needs to be one repo for one hour, not a user's account.
 */
import { App } from "@octokit/app";
import { db } from "@superset/db/client";
import {
	githubInstallations,
	githubRepositories,
	v2Projects,
} from "@superset/db/schema";
import { eq } from "drizzle-orm";
import { env } from "../../env";

export interface CloneTarget {
	cloneUrl: string;
	token: string | null;
	defaultBranch: string;
}

/**
 * Returns null when the project has no linked GitHub repo — the caller falls
 * back to an unauthenticated clone, which works for public repos.
 */
export async function resolveCloneTarget(
	projectId: string,
): Promise<CloneTarget | null> {
	const project = await db.query.v2Projects.findFirst({
		where: eq(v2Projects.id, projectId),
	});
	if (!project) return null;

	if (!project.githubRepositoryId) {
		return project.repoCloneUrl
			? { cloneUrl: project.repoCloneUrl, token: null, defaultBranch: "main" }
			: null;
	}

	const repo = await db.query.githubRepositories.findFirst({
		where: eq(githubRepositories.id, project.githubRepositoryId),
	});
	if (!repo) return null;

	const cloneUrl =
		project.repoCloneUrl ?? `https://github.com/${repo.fullName}.git`;

	if (!env.GH_APP_ID || !env.GH_APP_PRIVATE_KEY) {
		return { cloneUrl, token: null, defaultBranch: repo.defaultBranch };
	}

	const installation = await db.query.githubInstallations.findFirst({
		where: eq(githubInstallations.id, repo.installationId),
	});
	if (!installation) {
		return { cloneUrl, token: null, defaultBranch: repo.defaultBranch };
	}

	const app = new App({
		appId: env.GH_APP_ID,
		privateKey: env.GH_APP_PRIVATE_KEY,
	});
	const octokit = await app.getInstallationOctokit(
		Number(installation.installationId),
	);
	const { token } = (await octokit.auth({ type: "installation" })) as {
		token: string;
	};
	return { cloneUrl, token, defaultBranch: repo.defaultBranch };
}
