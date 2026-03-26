import { settings } from "@superset/local-db";
import { localDb } from "main/lib/local-db";
import { execGitWithShellPath, getSimpleGitWithShellPath } from "../../workspaces/utils/git-client";
import {
	getPRForBranch,
	getPullRequestRepoArgs,
	getRepoContext,
} from "../../workspaces/utils/github";
import { detectGitProvider, extractOnedevProjectPath } from "./git-provider";
import { execWithShellEnv } from "../../workspaces/utils/shell-env";
import { isNoPullRequestFoundMessage } from "../git-utils";
import { clearWorktreeStatusCaches } from "./worktree-status-caches";

const PR_ALREADY_MERGED_MESSAGE = "PR is already merged";
const PR_CLOSED_MESSAGE = "PR is closed and cannot be merged";

export interface MergePullRequestInput {
	worktreePath: string;
	strategy: "merge" | "squash" | "rebase";
}

export async function mergePullRequest({
	worktreePath,
	strategy,
}: MergePullRequestInput): Promise<{ success: boolean; mergedAt: string }> {
	// Check if this is a OneDev repo — use OneDev API instead of gh CLI
	const settingsRow = localDb.select().from(settings).get();
	const onedevUrl = settingsRow?.onedevUrl ?? null;
	const onedevToken = settingsRow?.onedevAccessToken ?? null;
	if (onedevUrl && onedevToken) {
		try {
			const git = await getSimpleGitWithShellPath(worktreePath);
			const remoteUrl = (await git.remote(["get-url", "origin"])).trim();
			const provider = detectGitProvider(remoteUrl, onedevUrl);
			if (provider === "onedev") {
				const projectPath = extractOnedevProjectPath(remoteUrl);
				if (!projectPath) throw new Error("Could not extract OneDev project path");
				const { createOnedevClient } = await import("./onedev-api");
				const client = createOnedevClient({ url: onedevUrl, accessToken: onedevToken });
				const projectInfo = await client.getProjectByPath(projectPath);
				if (!projectInfo) throw new Error(`OneDev project not found: ${projectPath}`);
				const branch = (await git.revparse(["--abbrev-ref", "HEAD"])).trim();
				const existingPR = await client.findOpenPRWithUrl(projectInfo.id, branch, projectPath);
				if (!existingPR) {
					// Check if there's a merged/closed PR for better error message
					const allPRs = await client.findAllPRsForBranch(branch);
					if (allPRs.length > 0) {
						const latest = allPRs[0];
						throw new Error(`PR for branch "${branch}" is already ${latest.status.toLowerCase()}. Nothing to merge.`);
					}
					throw new Error(`No PR found for branch "${branch}". Create a PR first using "Create Pull Request".`);
				}
				await client.mergePR(existingPR.id);

				// Auto-transition referenced issues to Closed
				try {
					const referencedIssues = await client.findReferencedOpenIssues(
						`${existingPR.title} ${branch}`,
						projectInfo.id,
					);
					for (const issue of referencedIssues) {
						await client.transitionIssueState(issue.id, "Closed");
						console.log(`[merge] Closed issue #${issue.number} after PR merge`);
					}
				} catch (err) {
					console.warn("[merge] Failed to auto-close issues:", err);
				}

				clearWorktreeStatusCaches(worktreePath);
				return { success: true, mergedAt: new Date().toISOString() };
			}
		} catch (error) {
			// If we identified it as OneDev, always throw — never fall through to gh
			throw error;
		}
	}

	const legacyMergeArgs = ["pr", "merge", `--${strategy}`];
	const runMerge = async (
		args: string[],
	): Promise<{ success: boolean; mergedAt: string }> => {
		await execWithShellEnv("gh", args, { cwd: worktreePath });
		clearWorktreeStatusCaches(worktreePath);
		return { success: true, mergedAt: new Date().toISOString() };
	};

	const repoContext = await getRepoContext(worktreePath);
	if (!repoContext) {
		return runMerge(legacyMergeArgs);
	}

	let pr: Awaited<ReturnType<typeof getPRForBranch>> = null;
	try {
		const [{ stdout: branchOutput }, { stdout: headOutput }] =
			await Promise.all([
				execGitWithShellPath(["rev-parse", "--abbrev-ref", "HEAD"], {
					cwd: worktreePath,
				}),
				execGitWithShellPath(["rev-parse", "HEAD"], { cwd: worktreePath }),
			]);
		const localBranch = branchOutput.trim();
		const headSha = headOutput.trim();

		pr = await getPRForBranch(worktreePath, localBranch, repoContext, headSha);
	} catch (error) {
		console.warn(
			"[git/mergePR] Explicit PR resolution failed; falling back to branch merge.",
			{
				worktreePath,
				error: error instanceof Error ? error.message : String(error),
			},
		);
		return runMerge(legacyMergeArgs);
	}

	if (!pr) {
		return runMerge(legacyMergeArgs);
	}
	if (pr.state === "merged") {
		throw new Error(PR_ALREADY_MERGED_MESSAGE);
	}
	if (pr.state === "closed") {
		throw new Error(PR_CLOSED_MESSAGE);
	}

	const args = [
		"pr",
		"merge",
		String(pr.number),
		`--${strategy}`,
		...getPullRequestRepoArgs(repoContext),
	];

	try {
		return await runMerge(args);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (isNoPullRequestFoundMessage(message)) {
			return runMerge(legacyMergeArgs);
		}
		throw error;
	}
}
