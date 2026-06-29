import type { SimpleGit } from "simple-git";
import type { ExecGh } from "../../workspace-creation/utils/exec-gh";

export interface ResolvePullRequestBaseRefArgs {
	git: SimpleGit;
	execGh: ExecGh;
	worktreePath: string;
	branchName: string | null | undefined;
	prNumber: number;
	repoOwner: string;
	repoName: string;
}

export async function resolvePullRequestBaseRef({
	git,
	execGh,
	worktreePath,
	branchName,
	prNumber,
	repoOwner,
	repoName,
}: ResolvePullRequestBaseRefArgs): Promise<string | null> {
	const configuredBaseRefName = await readConfiguredBranchBase(git, branchName);
	if (configuredBaseRefName) return configuredBaseRefName;

	const ghBaseRefName = await execGh(
		[
			"pr",
			"view",
			String(prNumber),
			"--repo",
			`${repoOwner}/${repoName}`,
			"--json",
			"baseRefName",
			"--jq",
			".baseRefName",
		],
		{ cwd: worktreePath, timeout: 10_000 },
	)
		.then((value) =>
			typeof value === "string" && value.trim() ? value.trim() : null,
		)
		.catch(() => null);

	return ghBaseRefName;
}

async function readConfiguredBranchBase(
	git: SimpleGit,
	branchName: string | null | undefined,
): Promise<string | null> {
	if (!branchName) return null;
	const configured = await git
		.raw(["config", `branch.${branchName}.base`])
		.catch(() => "");
	const trimmed = configured.trim();
	return trimmed || null;
}
