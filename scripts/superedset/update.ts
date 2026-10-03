import { $ } from "bun";
import {
	type GitHubRelease,
	type PullRequest,
	stableDesktopReleaseTag,
	validatePullRequests,
} from "./lib";

const CONFIG_BRANCH = "origin/superedset-config";
const UPSTREAM_REPOSITORY = "superset-sh/superset";
const PR_AUTHOR = process.env.SUPEREDSET_PR_AUTHOR ?? "@me";

async function text(command: ReturnType<typeof $>): Promise<string> {
	return (await command.text()).trim();
}

async function main(): Promise<void> {
	const root = await text($`git rev-parse --show-toplevel`);
	const branch = await text($`git branch --show-current`.cwd(root));
	if (branch !== "main")
		throw new Error("Run this command from the main worktree");

	const status = await text($`git status --porcelain`.cwd(root));
	if (status)
		throw new Error("Main worktree is dirty; commit or stash it first");

	await $`git config rerere.enabled true`.cwd(root);
	await $`git config rerere.autoupdate true`.cwd(root);
	const upstreamReleases = JSON.parse(
		await text(
			$`gh api ${`repos/${UPSTREAM_REPOSITORY}/releases?per_page=100`}`,
		),
	) as GitHubRelease[];
	const upstreamTag = stableDesktopReleaseTag(upstreamReleases);
	await $`git fetch upstream tag ${upstreamTag}`.cwd(root);
	await $`git fetch origin main superedset-config`.cwd(root);

	const oldOriginMain = await text($`git rev-parse origin/main`.cwd(root));
	const oldLocalMain = await text($`git rev-parse HEAD`.cwd(root));
	const oldLocalTree = await text(
		$`git rev-parse ${`${oldLocalMain}^{tree}`}`.cwd(root),
	);
	const configCommit = await text($`git rev-parse ${CONFIG_BRANCH}`.cwd(root));
	const summaries = JSON.parse(
		await text(
			$`gh pr list --repo ${UPSTREAM_REPOSITORY} --author ${PR_AUTHOR} --base main --state open --limit 100 --json number,title,headRefName,headRefOid,createdAt,url`,
		),
	) as Omit<PullRequest, "commits">[];

	const pullRequests = validatePullRequests(
		await Promise.all(
			summaries.map(async (pullRequest) => {
				const details = JSON.parse(
					await text(
						$`gh pr view ${pullRequest.number} --repo ${UPSTREAM_REPOSITORY} --json commits`,
					),
				) as Pick<PullRequest, "commits">;
				return { ...pullRequest, commits: details.commits };
			}),
		),
	);
	const integrations = await Promise.all(
		pullRequests.map(async (pullRequest) => {
			const previousCommit = await text(
				$`git log ${oldLocalMain} -1 --format=%H --fixed-strings --grep ${`cherry picked from commit ${pullRequest.headRefOid}`}`.cwd(
					root,
				),
			);
			return {
				...pullRequest,
				integrationCommit: previousCommit || pullRequest.headRefOid,
			};
		}),
	);

	for (const pullRequest of pullRequests) {
		await $`git fetch upstream ${`pull/${pullRequest.number}/head`}`.cwd(root);
	}

	await $`git reset --hard ${upstreamTag}`.cwd(root);
	await $`git cherry-pick ${configCommit}`.cwd(root);

	for (const pullRequest of integrations) {
		console.log(`Adding PR #${pullRequest.number}: ${pullRequest.title}`);
		await $`git cherry-pick -x ${pullRequest.integrationCommit}`.cwd(root);
	}

	const commitCount = Number(
		await text($`git rev-list --count ${`${upstreamTag}..HEAD`}`.cwd(root)),
	);
	if (commitCount !== pullRequests.length + 1) {
		throw new Error(
			`Expected ${pullRequests.length + 1} personal commits, found ${commitCount}`,
		);
	}
	const newTree = await text($`git rev-parse HEAD^{tree}`.cwd(root));
	if (newTree === oldLocalTree) {
		await $`git reset --hard origin/main`.cwd(root);
		console.log("Superedset is already up to date.");
		return;
	}

	await $`git push ${`--force-with-lease=main:${oldOriginMain}`} origin HEAD:main`.cwd(
		root,
	);

	console.log(
		`Superedset main now uses ${upstreamTag} with ${pullRequests.length} open PRs.`,
	);
	for (const pullRequest of pullRequests) {
		console.log(`  #${pullRequest.number} ${pullRequest.url}`);
	}
}

await main();
