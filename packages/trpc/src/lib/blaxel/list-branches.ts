/**
 * Branches for a cloud workspace come from the GitHub remote, not a host:
 * there is no machine holding a checkout until the sandbox is provisioned.
 */
import { db } from "@superset/db/client";
import {
	githubInstallations,
	githubRepositories,
	v2Projects,
} from "@superset/db/schema";
import { eq } from "drizzle-orm";
import { installationOctokit } from "./clone-token";

export interface RemoteBranch {
	name: string;
	isDefault: boolean;
}

export interface RemoteBranchPage {
	defaultBranch: string | null;
	items: RemoteBranch[];
}

const PER_PAGE = 100;

export async function listRemoteBranches(
	projectId: string,
	query?: string,
): Promise<RemoteBranchPage> {
	const project = await db.query.v2Projects.findFirst({
		where: eq(v2Projects.id, projectId),
	});
	if (!project?.githubRepositoryId) return { defaultBranch: null, items: [] };

	const repo = await db.query.githubRepositories.findFirst({
		where: eq(githubRepositories.id, project.githubRepositoryId),
	});
	if (!repo) return { defaultBranch: null, items: [] };

	const installation = await db.query.githubInstallations.findFirst({
		where: eq(githubInstallations.id, repo.installationId),
	});
	if (!installation) {
		return { defaultBranch: repo.defaultBranch, items: [] };
	}

	const octokit = await installationOctokit(installation.installationId);
	const { data } = await octokit.request("GET /repos/{owner}/{repo}/branches", {
		owner: repo.owner,
		repo: repo.name,
		per_page: PER_PAGE,
	});

	const needle = query?.trim().toLowerCase();
	const items = data
		.map((branch: { name: string }) => ({
			name: branch.name,
			isDefault: branch.name === repo.defaultBranch,
		}))
		.filter((b) => (needle ? b.name.toLowerCase().includes(needle) : true))
		// Default first, then alphabetical — the API returns them unordered and
		// the picker's first entry is what a user accepts without reading.
		.sort((a, b) => {
			if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
			return a.name.localeCompare(b.name);
		});

	return { defaultBranch: repo.defaultBranch, items };
}
