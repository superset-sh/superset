import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { workspaces } from "../../../../db/schema";
import { resolveRef } from "../../../../runtime/git/refs";
import { protectedProcedure } from "../../../index";
import { ensureMainWorkspace } from "../../project/utils/ensure-main-workspace";
import { checkoutInputSchema } from "../schemas";
import { finishCheckout } from "../shared/finish-checkout";
import { enablePushAutoSetupRemote } from "../shared/git-config";
import { requireLocalProject } from "../shared/local-project";
import { clearProgress, setProgress } from "../shared/progress-store";
import { safeResolveWorktreePath } from "../shared/worktree-paths";
import { execGh } from "../utils/exec-gh";
import { derivePrLocalBranchName } from "../utils/pr-branch-name";

export const checkout = protectedProcedure
	.input(checkoutInputSchema)
	.mutation(async ({ ctx, input }) => {
		setProgress(input.pendingId, "ensuring_repo");

		const localProject = requireLocalProject(ctx, input.projectId);
		await ensureMainWorkspace(ctx, input.projectId, localProject.repoPath);

		setProgress(input.pendingId, "creating_worktree");

		// ── PR path ────────────────────────────────────────────────────────
		if (input.pr) {
			const branch = derivePrLocalBranchName(input.pr);

			// Idempotency: existing workspace for this PR's branch →
			// return it. Renderer navigates to it via `alreadyExists: true`
			// instead of treating as a new create.
			const existing = ctx.db.query.workspaces
				.findFirst({
					where: and(
						eq(workspaces.projectId, input.projectId),
						eq(workspaces.branch, branch),
					),
				})
				.sync();
			if (existing) {
				clearProgress(input.pendingId);
				return {
					workspace: { id: existing.id },
					terminals: [],
					warnings: [],
					alreadyExists: true as const,
				};
			}

			let worktreePath: string;
			try {
				worktreePath = safeResolveWorktreePath(localProject.id, branch);
			} catch (err) {
				clearProgress(input.pendingId);
				throw err;
			}
			let git: Awaited<ReturnType<typeof ctx.git>>;
			try {
				mkdirSync(dirname(worktreePath), { recursive: true });
				git = await ctx.git(localProject.repoPath);
			} catch (err) {
				clearProgress(input.pendingId);
				throw err;
			}

			// Detect a pre-existing local branch with the same derived name
			// BEFORE running `gh pr checkout --force`. The idempotency check
			// above rules out Superset-managed worktrees, but a branch can
			// exist outside any workspace — e.g., from a prior manual
			// `gh pr checkout` in the primary working tree. `--force` would
			// reset it to the PR HEAD, silently losing any unpushed commits.
			// We surface a warning pointing at reflog for recovery rather
			// than blocking, so the point-and-click flow stays smooth.
			let preExistingLocalBranch = false;
			try {
				await git.raw([
					"show-ref",
					"--verify",
					"--quiet",
					`refs/heads/${branch}`,
				]);
				preExistingLocalBranch = true;
			} catch {
				// Non-zero exit = branch doesn't exist. Expected path.
			}

			// Detached worktree first — `gh pr checkout` inside it creates the
			// branch with correct fork-remote + upstream config. Mirrors v1's
			// `createWorktreeFromPr`.
			try {
				await git.raw(["worktree", "add", "--detach", worktreePath]);
			} catch (err) {
				clearProgress(input.pendingId);
				throw new TRPCError({
					code: "CONFLICT",
					message:
						err instanceof Error
							? err.message
							: "Failed to add detached worktree",
				});
			}

			try {
				await execGh(
					[
						"pr",
						"checkout",
						String(input.pr.number),
						"--branch",
						branch,
						"--force",
					],
					{ cwd: worktreePath, timeout: 120_000 },
				);
			} catch (err) {
				await git
					.raw(["worktree", "remove", "--force", worktreePath])
					.catch((rollbackErr) => {
						console.warn(
							"[workspaceCreation.checkout] failed to rollback PR worktree",
							{ worktreePath, err: rollbackErr },
						);
					});
				clearProgress(input.pendingId);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: `gh pr checkout failed: ${
						err instanceof Error ? err.message : String(err)
					}`,
				});
			}

			// Push ergonomics. `gh pr checkout` sets per-branch push config
			// to the fork URL for cross-repo PRs; this covers the same-repo
			// case where upstream isn't auto-set.
			await enablePushAutoSetupRemote(
				git,
				worktreePath,
				"[workspaceCreation.checkout]",
			);

			const extraWarnings: string[] = [];
			if (input.pr.state !== "open") {
				extraWarnings.push(
					`PR is ${input.pr.state} — commits are included, but the PR may not merge.`,
				);
			}
			if (preExistingLocalBranch) {
				extraWarnings.push(
					`Reset existing local branch "${branch}" to PR HEAD. If you had unpushed commits there, recover them via \`git reflog show ${branch}\`.`,
				);
			}

			return await finishCheckout(ctx, {
				pendingId: input.pendingId,
				projectId: input.projectId,
				workspaceName: input.workspaceName,
				branch,
				worktreePath,
				baseBranch: input.composer.baseBranch,
				runSetupScript: input.composer.runSetupScript ?? false,
				git,
				extraWarnings,
			});
		}

		// ── Branch path ────────────────────────────────────────────────────
		const branch = (input.branch ?? "").trim();
		if (!branch) {
			clearProgress(input.pendingId);
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Branch name is empty",
			});
		}

		let worktreePath: string;
		try {
			worktreePath = safeResolveWorktreePath(localProject.id, branch);
		} catch (err) {
			clearProgress(input.pendingId);
			throw err;
		}
		let git: Awaited<ReturnType<typeof ctx.git>>;
		try {
			mkdirSync(dirname(worktreePath), { recursive: true });
			git = await ctx.git(localProject.repoPath);
		} catch (err) {
			clearProgress(input.pendingId);
			throw err;
		}

		// Resolve via the discriminated-ref helper so we don't infer kind
		// from a refname string (a local branch named `origin/foo` would
		// otherwise be misclassified). See GIT_REFS.md.
		const resolved = await resolveRef(git, branch);
		if (!resolved || resolved.kind === "head" || resolved.kind === "tag") {
			clearProgress(input.pendingId);
			throw new TRPCError({
				code: "BAD_REQUEST",
				message:
					resolved?.kind === "tag"
						? `"${branch}" is a tag, not a branch — cannot check out into a workspace`
						: `Branch "${branch}" does not exist locally or on origin`,
			});
		}

		if (resolved.kind === "remote-tracking") {
			try {
				await git.fetch([
					resolved.remote,
					resolved.shortName,
					"--quiet",
					"--no-tags",
				]);
			} catch (err) {
				console.warn(
					`[workspaceCreation.checkout] fetch ${resolved.remoteShortName} failed:`,
					err,
				);
			}
		}

		try {
			// For a remote-only branch, create a local tracking branch
			// explicitly. `git worktree add <path> origin/<branch>` without
			// --track/-b produces a detached HEAD because the fully-qualified
			// ref is treated as a commit-ish, not a branch shorthand.
			await git.raw(
				resolved.kind === "remote-tracking"
					? [
							"worktree",
							"add",
							"--track",
							"-b",
							branch,
							worktreePath,
							resolved.remoteShortName,
						]
					: ["worktree", "add", worktreePath, resolved.shortName],
			);
		} catch (err) {
			clearProgress(input.pendingId);
			const message =
				err instanceof Error ? err.message : "Failed to add worktree";
			// Most common cause here is "branch already checked out elsewhere".
			// Client disables the button for known cases via isCheckedOut, but
			// we still get here for races.
			throw new TRPCError({ code: "CONFLICT", message });
		}

		// Enable autoSetupRemote so the first terminal `git push` on a
		// local-only branch creates origin/<branch> without requiring -u.
		// Branches checked out from a remote already have upstream set
		// via --track above, so this config is a no-op for them.
		// `--local` in a linked worktree writes to the shared repo config,
		// so this applies repo-wide — intentional.
		await enablePushAutoSetupRemote(
			git,
			worktreePath,
			"[workspaceCreation.checkout]",
		);

		return await finishCheckout(ctx, {
			pendingId: input.pendingId,
			projectId: input.projectId,
			workspaceName: input.workspaceName,
			branch,
			worktreePath,
			baseBranch: input.composer.baseBranch,
			runSetupScript: input.composer.runSetupScript ?? false,
			git,
			extraWarnings: [],
		});
	});
