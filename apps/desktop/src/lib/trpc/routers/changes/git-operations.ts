import { TRPCError } from "@trpc/server";
import simpleGit from "simple-git";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { execWithShellEnv } from "../workspaces/utils/shell-env";
import { isUpstreamMissingError } from "./git-utils";
import { assertRegisteredWorktree } from "./security";

export { isUpstreamMissingError };

async function hasUpstreamBranch(
	git: ReturnType<typeof simpleGit>,
): Promise<boolean> {
	try {
		await git.raw(["rev-parse", "--abbrev-ref", "@{upstream}"]);
		return true;
	} catch {
		return false;
	}
}

async function fetchCurrentBranch(
	git: ReturnType<typeof simpleGit>,
): Promise<void> {
	const branch = (await git.revparse(["--abbrev-ref", "HEAD"])).trim();
	try {
		await git.fetch(["origin", branch]);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (isUpstreamMissingError(message)) {
			try {
				await git.fetch(["origin"]);
			} catch (fallbackError) {
				const fallbackMessage =
					fallbackError instanceof Error
						? fallbackError.message
						: String(fallbackError);
				if (!isUpstreamMissingError(fallbackMessage)) {
					console.error(
						`[git/fetch] failed fallback fetch for branch ${branch}:`,
						fallbackError,
					);
					throw fallbackError;
				}
			}
			return;
		}
		throw error;
	}
}

async function pushWithSetUpstream({
	git,
	branch,
}: {
	git: ReturnType<typeof simpleGit>;
	branch: string;
}): Promise<void> {
	const trimmedBranch = branch.trim();
	if (!trimmedBranch || trimmedBranch === "HEAD") {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				"Cannot push from detached HEAD. Please checkout a branch and try again.",
		});
	}

	// Use HEAD refspec to avoid resolving the branch name as a local ref.
	// This is more reliable for worktrees where upstream tracking isn't set yet.
	await git.push([
		"--set-upstream",
		"origin",
		`HEAD:refs/heads/${trimmedBranch}`,
	]);
}

function _buildCommitMessagePrompt({
	stagedFiles,
	diffStat,
	detailedDiff,
}: {
	stagedFiles: string;
	diffStat: string;
	detailedDiff: string;
}): string {
	return [
		"Generate a concise conventional commit message for these changes.",
		"Use format: <type>(<scope>): <description>",
		"Types: feat, fix, refactor, docs, style, test, chore, perf",
		"Keep the description under 72 characters.",
		"Only output the commit message, nothing else.",
		"",
		"Files changed:",
		stagedFiles,
		"",
		"Diff stat:",
		diffStat,
		"",
		"Diff:",
		detailedDiff,
	].join("\n");
}

interface DiffContext {
	stagedFiles: string;
	diffStat: string;
	detailedDiff: string;
}

async function generateMessageFromDiff(ctx: DiffContext): Promise<string> {
	// Parse file operations from name-status output
	const lines = ctx.stagedFiles.trim().split("\n").filter(Boolean);
	const ops: { type: string; file: string }[] = lines.map((line) => {
		const [status, ...rest] = line.split("\t");
		return { type: status.trim(), file: rest.join("\t").trim() };
	});

	if (ops.length === 0) {
		return "chore: update files";
	}

	// Detect common patterns
	const allAdded = ops.every((o) => o.type.startsWith("A"));
	const allDeleted = ops.every((o) => o.type.startsWith("D"));
	const allRenamed = ops.every((o) => o.type.startsWith("R"));
	const _allModified = ops.every((o) => o.type.startsWith("M"));

	// Extract scope from common directory
	const paths = ops.map((o) => o.file);
	const scope = getCommonScope(paths);
	const scopePart = scope ? `(${scope})` : "";

	// Detect type from diff content
	const diffLower = ctx.detailedDiff.toLowerCase();
	const isTest =
		paths.some((p) => p.includes("test") || p.includes("spec")) ||
		diffLower.includes("describe(") ||
		diffLower.includes("it(") ||
		diffLower.includes("test(");
	const isDocs = paths.some(
		(p) => p.endsWith(".md") || p.includes("docs/") || p.includes("README"),
	);

	if (ops.length === 1) {
		const op = ops[0];
		const fileName = op.file.split("/").pop() || op.file;
		if (op.type.startsWith("A")) {
			const type = isTest ? "test" : isDocs ? "docs" : "feat";
			return `${type}${scopePart}: add ${fileName}`;
		}
		if (op.type.startsWith("D")) {
			return `chore${scopePart}: remove ${fileName}`;
		}
		if (op.type.startsWith("R")) {
			return `refactor${scopePart}: rename ${fileName}`;
		}
	}

	// Multi-file operations
	if (allAdded) {
		const type = isTest ? "test" : isDocs ? "docs" : "feat";
		return `${type}${scopePart}: add ${ops.length} files`;
	}
	if (allDeleted) {
		return `chore${scopePart}: remove ${ops.length} files`;
	}
	if (allRenamed) {
		return `refactor${scopePart}: rename ${ops.length} files`;
	}

	// Analyze diff for fix indicators
	const isFix =
		diffLower.includes("fix") ||
		diffLower.includes("bug") ||
		diffLower.includes("error") ||
		diffLower.includes("issue");

	const type = isTest ? "test" : isDocs ? "docs" : isFix ? "fix" : "feat";

	// Generate a short description from the filenames
	const fileNames = paths.map((p) => p.split("/").pop()).filter(Boolean);
	const uniqueNames = [...new Set(fileNames)];
	const desc =
		uniqueNames.length <= 3
			? `update ${uniqueNames.join(", ")}`
			: `update ${uniqueNames.length} files`;

	return `${type}${scopePart}: ${desc}`;
}

function getCommonScope(paths: string[]): string {
	if (paths.length === 0) return "";

	const parts = paths.map((p) => p.split("/"));
	const minLen = Math.min(...parts.map((p) => p.length));

	let commonDepth = 0;
	for (let i = 0; i < minLen - 1; i++) {
		const segment = parts[0][i];
		if (parts.every((p) => p[i] === segment)) {
			commonDepth = i + 1;
		} else {
			break;
		}
	}

	if (commonDepth === 0) return "";

	// Use the deepest common directory as scope
	const scopePath = parts[0].slice(0, commonDepth).join("/");

	// Simplify known directory patterns
	if (scopePath.includes("apps/")) {
		const match = scopePath.match(/apps\/([^/]+)/);
		if (match) return match[1];
	}
	if (scopePath.includes("packages/")) {
		const match = scopePath.match(/packages\/([^/]+)/);
		if (match) return match[1];
	}

	// Return the last segment of the common path
	return parts[0][commonDepth - 1];
}

function shouldRetryPushWithUpstream(message: string): boolean {
	const lowerMessage = message.toLowerCase();
	return (
		lowerMessage.includes("no upstream branch") ||
		lowerMessage.includes("no tracking information") ||
		lowerMessage.includes(
			"upstream branch of your current branch does not match",
		) ||
		lowerMessage.includes("cannot be resolved to branch") ||
		lowerMessage.includes("couldn't find remote ref")
	);
}

export const createGitOperationsRouter = () => {
	return router({
		// NOTE: saveFile is defined in file-contents.ts with hardened path validation
		// Do NOT add saveFile here - it would overwrite the secure version

		generateCommitMessage: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
				}),
			)
			.mutation(async ({ input }): Promise<{ message: string }> => {
				assertRegisteredWorktree(input.worktreePath);

				const git = simpleGit(input.worktreePath);

				// Get the staged diff
				const diff = await git.diff(["--cached", "--stat"]);
				if (!diff.trim()) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "No staged changes to generate a message for",
					});
				}

				// Get detailed diff (limited to avoid huge payloads)
				const detailedDiff = await git.diff(["--cached"]);
				const truncatedDiff =
					detailedDiff.length > 8000
						? `${detailedDiff.slice(0, 8000)}\n... (truncated)`
						: detailedDiff;

				// Get the list of staged files for context
				const stagedFiles = await git.diff(["--cached", "--name-status"]);

				const message = await generateMessageFromDiff({
					stagedFiles,
					diffStat: diff,
					detailedDiff: truncatedDiff,
				});

				return { message };
			}),

		commit: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					message: z.string(),
				}),
			)
			.mutation(
				async ({ input }): Promise<{ success: boolean; hash: string }> => {
					assertRegisteredWorktree(input.worktreePath);

					const git = simpleGit(input.worktreePath);
					const result = await git.commit(input.message);
					return { success: true, hash: result.commit };
				},
			),

		push: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					setUpstream: z.boolean().optional(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				assertRegisteredWorktree(input.worktreePath);

				const git = simpleGit(input.worktreePath);
				const hasUpstream = await hasUpstreamBranch(git);

				if (input.setUpstream && !hasUpstream) {
					const branch = await git.revparse(["--abbrev-ref", "HEAD"]);
					await pushWithSetUpstream({ git, branch });
				} else {
					try {
						await git.push();
					} catch (error) {
						const message =
							error instanceof Error ? error.message : String(error);
						if (shouldRetryPushWithUpstream(message)) {
							const branch = await git.revparse(["--abbrev-ref", "HEAD"]);
							await pushWithSetUpstream({ git, branch });
						} else {
							throw error;
						}
					}
				}
				await fetchCurrentBranch(git);
				return { success: true };
			}),

		pull: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				assertRegisteredWorktree(input.worktreePath);

				const git = simpleGit(input.worktreePath);
				try {
					await git.pull(["--rebase"]);
				} catch (error) {
					const message =
						error instanceof Error ? error.message : String(error);
					if (isUpstreamMissingError(message)) {
						throw new Error(
							"No upstream branch to pull from. The remote branch may have been deleted.",
						);
					}
					throw error;
				}
				return { success: true };
			}),

		sync: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				assertRegisteredWorktree(input.worktreePath);

				const git = simpleGit(input.worktreePath);
				try {
					await git.pull(["--rebase"]);
				} catch (error) {
					const message =
						error instanceof Error ? error.message : String(error);
					if (isUpstreamMissingError(message)) {
						const branch = await git.revparse(["--abbrev-ref", "HEAD"]);
						await pushWithSetUpstream({ git, branch });
						await fetchCurrentBranch(git);
						return { success: true };
					}
					throw error;
				}
				await git.push();
				await fetchCurrentBranch(git);
				return { success: true };
			}),

		fetch: publicProcedure
			.input(z.object({ worktreePath: z.string() }))
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				assertRegisteredWorktree(input.worktreePath);
				const git = simpleGit(input.worktreePath);
				await fetchCurrentBranch(git);
				return { success: true };
			}),

		createPR: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					title: z.string().optional(),
					body: z.string().optional(),
					draft: z.boolean().optional(),
					baseBranch: z.string().optional(),
				}),
			)
			.mutation(
				async ({
					input,
				}): Promise<{
					success: boolean;
					url: string;
					number: number;
				}> => {
					assertRegisteredWorktree(input.worktreePath);

					const git = simpleGit(input.worktreePath);
					const branch = (await git.revparse(["--abbrev-ref", "HEAD"])).trim();
					const hasUpstream = await hasUpstreamBranch(git);

					// Ensure branch is pushed first
					if (!hasUpstream) {
						await pushWithSetUpstream({ git, branch });
					} else {
						try {
							await git.push();
						} catch (error) {
							const message =
								error instanceof Error ? error.message : String(error);
							if (shouldRetryPushWithUpstream(message)) {
								await pushWithSetUpstream({ git, branch });
							} else {
								throw error;
							}
						}
					}

					// Build gh pr create arguments
					const args = ["pr", "create"];

					const prTitle = input.title || branch.replace(/[-_/]/g, " ").trim();
					args.push("--title", prTitle);

					if (input.body) {
						args.push("--body", input.body);
					} else {
						args.push("--body", "");
					}

					if (input.draft) {
						args.push("--draft");
					}

					if (input.baseBranch) {
						args.push("--base", input.baseBranch);
					}

					try {
						const { stdout } = await execWithShellEnv("gh", args, {
							cwd: input.worktreePath,
						});
						const url = stdout.trim();

						// Extract PR number from URL (e.g., https://github.com/org/repo/pull/123)
						const prNumberMatch = url.match(/\/pull\/(\d+)/);
						const prNumber = prNumberMatch
							? Number.parseInt(prNumberMatch[1], 10)
							: 0;

						await fetchCurrentBranch(git);

						return { success: true, url, number: prNumber };
					} catch (error) {
						const message =
							error instanceof Error ? error.message : String(error);
						console.error("[git/createPR] Failed to create PR:", message);

						if (message.includes("already exists")) {
							throw new TRPCError({
								code: "BAD_REQUEST",
								message: "A pull request already exists for this branch",
							});
						}

						throw new TRPCError({
							code: "INTERNAL_SERVER_ERROR",
							message: `Failed to create PR: ${message}`,
						});
					}
				},
			),

		generatePRBody: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					baseBranch: z.string().optional(),
				}),
			)
			.query(async ({ input }): Promise<{ title: string; body: string }> => {
				assertRegisteredWorktree(input.worktreePath);

				const git = simpleGit(input.worktreePath);
				const branch = (await git.revparse(["--abbrev-ref", "HEAD"])).trim();
				const base = input.baseBranch || "main";

				// Get commit log for the branch
				let logOutput = "";
				try {
					logOutput = await git.raw([
						"log",
						`origin/${base}..HEAD`,
						"--format=%s",
					]);
				} catch {
					// Fall back to just the branch name
				}

				const commits = logOutput.trim().split("\n").filter(Boolean);

				// Generate title from branch name
				const title = branch
					.replace(/^(feat|fix|chore|refactor|docs|test|perf)[/-]/i, "")
					.replace(/[-_/]/g, " ")
					.replace(/\b\w/g, (c) => c.toUpperCase())
					.trim();

				// Generate body from commits
				const body =
					commits.length > 0
						? `## Changes\n\n${commits.map((c) => `- ${c}`).join("\n")}`
						: "";

				return { title, body };
			}),

		mergePR: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					strategy: z.enum(["merge", "squash", "rebase"]).default("squash"),
				}),
			)
			.mutation(
				async ({ input }): Promise<{ success: boolean; mergedAt?: string }> => {
					assertRegisteredWorktree(input.worktreePath);

					const args = ["pr", "merge", `--${input.strategy}`];

					try {
						await execWithShellEnv("gh", args, { cwd: input.worktreePath });
						return { success: true, mergedAt: new Date().toISOString() };
					} catch (error) {
						const message =
							error instanceof Error ? error.message : String(error);
						console.error("[git/mergePR] Failed to merge PR:", message);

						if (message.includes("no pull requests found")) {
							throw new TRPCError({
								code: "NOT_FOUND",
								message: "No pull request found for this branch",
							});
						}
						if (
							message.includes("not mergeable") ||
							message.includes("blocked")
						) {
							throw new TRPCError({
								code: "BAD_REQUEST",
								message:
									"PR cannot be merged. Check for merge conflicts or required status checks.",
							});
						}
						throw new TRPCError({
							code: "INTERNAL_SERVER_ERROR",
							message: `Failed to merge PR: ${message}`,
						});
					}
				},
			),
	});
};
