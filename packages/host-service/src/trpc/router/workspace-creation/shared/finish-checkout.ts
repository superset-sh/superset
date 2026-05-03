import { getHostId, getHostName } from "@superset/shared/host-info";
import { TRPCError } from "@trpc/server";
import { workspaces } from "../../../../db/schema";
import type { CheckoutPullRequestMetadata } from "../../../../runtime/pull-requests";
import type { HostServiceContext } from "../../../../types";
import { clearProgress, setProgress } from "./progress-store";
import { startSetupTerminalIfPresent } from "./setup-terminal";
import type { CheckoutResult, GitClient, TerminalDescriptor } from "./types";

/**
 * Shared postlude for `checkout` (both branch and PR paths).
 *
 * - Writes `branch.<name>.base` from `composer.baseBranch` for the Changes tab.
 * - `ensureV2Host` + `v2Workspace.create` with rollback on failure.
 * - Inserts the local `workspaces` row.
 * - Optionally spawns the setup terminal.
 * - Clears progress.
 */
export async function finishCheckout(
	ctx: HostServiceContext,
	args: {
		pendingId: string;
		projectId: string;
		workspaceName: string;
		branch: string;
		worktreePath: string;
		baseBranch: string | undefined;
		runSetupScript: boolean;
		git: GitClient;
		extraWarnings: string[];
		pullRequest?: CheckoutPullRequestMetadata;
	},
): Promise<CheckoutResult> {
	setProgress(args.pendingId, "registering");

	// Record the base branch for the Changes tab (skipped if unset — matches
	// `create`'s head-start-point behavior).
	if (args.baseBranch) {
		await args.git
			.raw([
				"-C",
				args.worktreePath,
				"config",
				`branch.${args.branch}.base`,
				args.baseBranch,
			])
			.catch((err) => {
				console.warn(
					`[workspaceCreation.checkout] failed to record base branch ${args.baseBranch}:`,
					err,
				);
			});
	}

	const rollbackWorktree = async () => {
		try {
			await args.git.raw(["worktree", "remove", args.worktreePath]);
		} catch (err) {
			console.warn("[workspaceCreation.checkout] failed to rollback worktree", {
				worktreePath: args.worktreePath,
				err,
			});
		}
	};

	const machineId = getHostId();
	const hostName = getHostName();

	let host: { machineId: string };
	try {
		host = await ctx.api.host.ensure.mutate({
			organizationId: ctx.organizationId,
			machineId,
			name: hostName,
		});
	} catch (err) {
		console.error("[workspaceCreation.checkout] host.ensure failed", err);
		clearProgress(args.pendingId);
		await rollbackWorktree();
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: `Failed to register host: ${err instanceof Error ? err.message : String(err)}`,
		});
	}

	const cloudRow = await ctx.api.v2Workspace.create
		.mutate({
			organizationId: ctx.organizationId,
			projectId: args.projectId,
			name: args.workspaceName,
			branch: args.branch,
			hostId: host.machineId,
		})
		.catch(async (err) => {
			console.error(
				"[workspaceCreation.checkout] v2Workspace.create failed",
				err,
			);
			clearProgress(args.pendingId);
			await rollbackWorktree();
			throw err;
		});

	if (!cloudRow) {
		clearProgress(args.pendingId);
		await rollbackWorktree();
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Cloud workspace create returned no row",
		});
	}

	try {
		ctx.db
			.insert(workspaces)
			.values({
				id: cloudRow.id,
				projectId: args.projectId,
				worktreePath: args.worktreePath,
				branch: args.branch,
			})
			.run();
	} catch (err) {
		console.error(
			"[workspaceCreation.checkout] local workspaces insert failed",
			err,
		);
		clearProgress(args.pendingId);
		await rollbackWorktree();
		await ctx.api.v2Workspace.delete
			.mutate({ id: cloudRow.id })
			.catch((cleanupErr) => {
				console.warn(
					"[workspaceCreation.checkout] failed to rollback cloud workspace",
					{ workspaceId: cloudRow.id, err: cleanupErr },
				);
			});
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: `Failed to persist workspace locally: ${err instanceof Error ? err.message : String(err)}`,
		});
	}

	const terminals: TerminalDescriptor[] = [];
	const warnings: string[] = [...args.extraWarnings];

	if (args.pullRequest) {
		try {
			await ctx.runtime.pullRequests.linkWorkspaceToCheckoutPullRequest({
				workspaceId: cloudRow.id,
				projectId: args.projectId,
				pullRequest: args.pullRequest,
			});
		} catch (err) {
			console.warn(
				"[workspaceCreation.checkout] failed to link checkout PR metadata",
				{ workspaceId: cloudRow.id, err },
			);
			warnings.push(
				"Workspace was created, but Superset could not link pull request status automatically.",
			);
		}
	}

	if (args.runSetupScript) {
		const { terminal, warning } = await startSetupTerminalIfPresent({
			ctx,
			workspaceId: cloudRow.id,
			worktreePath: args.worktreePath,
		});
		if (warning) {
			warnings.push(warning);
		}
		if (terminal) {
			terminals.push(terminal);
		}
	}

	clearProgress(args.pendingId);

	return { workspace: cloudRow, terminals, warnings };
}
