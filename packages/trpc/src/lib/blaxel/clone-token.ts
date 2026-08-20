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
import { githubInstallations, githubRepositories } from "@superset/db/schema";
import { eq } from "drizzle-orm";
import { env } from "../../env";
import { repoForProject } from "./repo-for-project";

/** Shared by the clone and branch-listing paths. */
export async function installationOctokit(installationId: string) {
	if (!env.GH_APP_ID || !env.GH_APP_PRIVATE_KEY) {
		throw new Error("GitHub App is not configured");
	}
	const app = new App({
		appId: env.GH_APP_ID,
		privateKey: env.GH_APP_PRIVATE_KEY,
	});
	return app.getInstallationOctokit(Number(installationId));
}

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
	const repo = await repoForProject(projectId);
	if (!repo) return null;

	const cloneUrl = `https://github.com/${repo.owner}/${repo.name}.git`;
	if (!repo.repositoryId || !env.GH_APP_ID || !env.GH_APP_PRIVATE_KEY) {
		return { cloneUrl, token: null, defaultBranch: repo.defaultBranch };
	}

	const row = await db.query.githubRepositories.findFirst({
		where: eq(githubRepositories.id, repo.repositoryId),
	});
	if (!row) return { cloneUrl, token: null, defaultBranch: repo.defaultBranch };

	const installation = await db.query.githubInstallations.findFirst({
		where: eq(githubInstallations.id, row.installationId),
	});
	if (!installation) {
		return { cloneUrl, token: null, defaultBranch: repo.defaultBranch };
	}

	const octokit = await installationOctokit(installation.installationId);
	const { token } = (await octokit.auth({ type: "installation" })) as {
		token: string;
	};
	return { cloneUrl, token, defaultBranch: repo.defaultBranch };
}
