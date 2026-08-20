/**
 * Branches for a cloud workspace, read from the GitHub remote with the App
 * installation token. Desktop lists them through the local host's `gh`
 * instead (the user's own auth); a phone has no host to ask, so this is the
 * only source that works with zero machines online.
 */
import { db } from "@superset/db/client";
import { githubInstallations, githubRepositories } from "@superset/db/schema";
import { eq } from "drizzle-orm";
import { installationOctokit } from "./clone-token";
import { repoForProject } from "./repo-for-project";

export interface RemoteBranch {
	name: string;
	isDefault: boolean;
}

export interface RemoteBranchPage {
	defaultBranch: string | null;
	items: RemoteBranch[];
}

const PER_PAGE = 100;
/** Enough for a query to reach deep branches without unbounded API walks. */
const MAX_PAGES = 10;

export async function listRemoteBranches(
	projectId: string,
	query?: string,
): Promise<RemoteBranchPage> {
	const repo = await repoForProject(projectId);
	if (!repo) return { defaultBranch: null, items: [] };
	// No installation to authenticate with — the default branch alone still
	// lets a picker offer something create will accept.
	if (!repo.repositoryId) {
		return { defaultBranch: repo.defaultBranch, items: [] };
	}

	const row = await db.query.githubRepositories.findFirst({
		where: eq(githubRepositories.id, repo.repositoryId),
	});
	const installation = row
		? await db.query.githubInstallations.findFirst({
				where: eq(githubInstallations.id, row.installationId),
			})
		: undefined;
	if (!installation) {
		return { defaultBranch: repo.defaultBranch, items: [] };
	}

	let data: Array<{ name: string }>;
	try {
		const octokit = await installationOctokit(installation.installationId);
		// Paginated: a repo easily holds more than one page of branches, and a
		// single request would make everything past it unfindable.
		data = [];
		for (let page = 1; page <= MAX_PAGES; page++) {
			const response = await octokit.request(
				"GET /repos/{owner}/{repo}/branches",
				{ owner: repo.owner, repo: repo.name, per_page: PER_PAGE, page },
			);
			data.push(...response.data);
			if (response.data.length < PER_PAGE) break;
		}
	} catch (error) {
		// An installation that stopped matching the App (uninstalled, or a dev
		// environment pointed at another App's data) shouldn't break the
		// picker: the default branch is still enough for create to proceed.
		console.warn(
			`[cloud-workspace] branch listing failed for ${repo.owner}/${repo.name}`,
			error instanceof Error ? error.message : error,
		);
		return { defaultBranch: repo.defaultBranch, items: [] };
	}

	const needle = query?.trim().toLowerCase();
	const items = data
		.map((branch: { name: string }) => ({
			name: branch.name,
			isDefault: branch.name === repo.defaultBranch,
		}))
		.filter((branch) =>
			needle ? branch.name.toLowerCase().includes(needle) : true,
		)
		// Default first, then alphabetical — the API returns them unordered and
		// the picker's first entry is what a user accepts without reading.
		.sort((a, b) => {
			if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
			return a.name.localeCompare(b.name);
		});

	return { defaultBranch: repo.defaultBranch, items };
}
