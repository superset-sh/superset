import { existsSync } from "node:fs";
import { join } from "node:path";
import { getDeviceName, getHashedDeviceId } from "@superset/shared/device-info";
import { TRPCError } from "@trpc/server";
import { workspaces } from "../../../db/schema";
import { createTerminalSessionInternal } from "../../../terminal/terminal";
import type { HostServiceContext } from "../../../types";
import type { GitClient } from "./helpers";
import { clearProgress, setProgress } from "./progress";

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
	},
): Promise<{
	workspace: { id: string };
	terminals: Array<{ id: string; role: string; label: string }>;
	warnings: string[];
	alreadyExists?: false;
}> {
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

	const deviceClientId = getHashedDeviceId();
	const deviceName = getDeviceName();

	let host: { id: string };
	try {
		host = await ctx.api.device.ensureV2Host.mutate({
			organizationId: ctx.organizationId,
			machineId: deviceClientId,
			name: deviceName,
		});
	} catch (err) {
		console.error("[workspaceCreation.checkout] ensureV2Host failed", err);
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
			hostId: host.id,
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

	ctx.db
		.insert(workspaces)
		.values({
			id: cloudRow.id,
			projectId: args.projectId,
			worktreePath: args.worktreePath,
			branch: args.branch,
		})
		.run();

	const terminals: Array<{ id: string; role: string; label: string }> = [];
	const warnings: string[] = [...args.extraWarnings];

	if (args.runSetupScript) {
		const setupScriptPath = join(args.worktreePath, ".superset", "setup.sh");
		if (existsSync(setupScriptPath)) {
			const terminalId = crypto.randomUUID();
			const result = createTerminalSessionInternal({
				terminalId,
				workspaceId: cloudRow.id,
				db: ctx.db,
				initialCommand: `bash "${setupScriptPath}"`,
			});
			if ("error" in result) {
				warnings.push(`Failed to start setup terminal: ${result.error}`);
			} else {
				terminals.push({
					id: terminalId,
					role: "setup",
					label: "Workspace Setup",
				});
			}
		}
	}

	clearProgress(args.pendingId);

	return { workspace: cloudRow, terminals, warnings };
}
