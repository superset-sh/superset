import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { getToolEnvironment } from "../../../../terminal/clean-shell-env";
import { execGh } from "../../workspace-creation/utils/exec-gh";

const execFileAsync = promisify(execFile);
const commitSha = z.string().regex(/^[a-f0-9]{40}$/i);
const pullRequestRefs = z.object({
	base: z.object({ sha: commitSha }),
	head: z.object({ sha: commitSha }),
});
const comparison = z.object({
	merge_base_commit: z.object({ sha: commitSha }),
});

export async function fetchPullRequestGitDiff(
	repoFullName: string,
	prNumber: number,
): Promise<string> {
	const { base, head } = pullRequestRefs.parse(
		await execGh(["api", `repos/${repoFullName}/pulls/${prNumber}`]),
	);
	const { merge_base_commit: mergeBase } = comparison.parse(
		await execGh([
			"api",
			`repos/${repoFullName}/compare/${base.sha}...${head.sha}?per_page=1`,
		]),
	);
	return diffRemoteCommits(
		`https://github.com/${repoFullName}.git`,
		mergeBase.sha,
		head.sha,
	);
}

export async function diffRemoteCommits(
	remoteUrl: string,
	baseSha: string,
	headSha: string,
): Promise<string> {
	commitSha.parse(baseSha);
	commitSha.parse(headSha);
	const toolEnv = await getToolEnvironment();
	const env = Object.fromEntries(
		Object.entries(toolEnv).filter(([key]) => !key.startsWith("GIT_")),
	);
	const directory = await mkdtemp(join(tmpdir(), "superset-pr-diff-"));
	const git = async (args: string[]) => {
		const { stdout } = await execFileAsync(
			"git",
			[
				`--git-dir=${directory}`,
				"-c",
				"credential.helper=",
				"-c",
				"credential.https://github.com.helper=!gh auth git-credential",
				"-c",
				`core.hooksPath=${join(directory, "hooks")}`,
				...args,
			],
			{
				cwd: directory,
				env: { ...env, GIT_TERMINAL_PROMPT: "0", LC_ALL: "C" },
				encoding: "utf8",
				timeout: 120_000,
				maxBuffer: 200 * 1024 * 1024,
			},
		);
		return stdout;
	};
	try {
		await git(["init", "--bare", "--template="]);
		await git([
			"fetch",
			"--no-tags",
			"--depth=1",
			"--filter=blob:none",
			remoteUrl,
			baseSha,
			headSha,
		]);
		return await git([
			"-c",
			"core.quotePath=false",
			"diff",
			"--no-color",
			"--no-ext-diff",
			"--no-textconv",
			"--find-renames",
			"--unified=3",
			"--src-prefix=a/",
			"--dst-prefix=b/",
			baseSha,
			headSha,
			"--",
		]);
	} finally {
		await rm(directory, { recursive: true, force: true }).catch((error) => {
			console.warn(
				"[pull-requests] Failed to remove temporary diff repository",
				error,
			);
		});
	}
}
