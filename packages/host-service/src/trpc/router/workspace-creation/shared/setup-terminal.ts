import { eq } from "drizzle-orm";
import { projects, workspaces } from "../../../../db/schema";
import {
	resolveScript,
	shellSingleQuote,
} from "../../../../runtime/setup/config";
import { createTerminalSessionInternal } from "../../../../terminal/terminal";
import type { HostServiceContext } from "../../../../types";
import type { TerminalDescriptor } from "./types";

interface StartSetupTerminalArgs {
	ctx: HostServiceContext;
	workspaceId: string;
	/**
	 * Appended to the resolved setup command with ` && `, so it runs in the
	 * setup terminal only after setup succeeds. Ignored when no setup command
	 * resolves — the caller must then dispatch it separately.
	 */
	chainCommand?: string;
}

interface StartSetupTerminalResult {
	terminal: TerminalDescriptor | null;
	warning: string | null;
	/** True when `chainCommand` was chained into the started setup terminal. */
	chained: boolean;
}

/**
 * Resolve and start the workspace-creation setup terminal, if any.
 *
 * Source order is the shared lifecycle-script posture (see `resolveScript`):
 * configured `setup` commands (joined with ` && ` so failures short-circuit;
 * worktree config overrides the main repo's), then `bash .superset/setup.sh`
 * (worktree first, then main repo). Scripts that need the canonical
 * `.superset/` dir read `$SUPERSET_ROOT_PATH`, injected by the v2 terminal
 * env builder. Configured `cwd` is honored via the terminal session.
 *
 * No-op when no source resolves to anything runnable.
 */
export async function startSetupTerminalIfPresent(
	args: StartSetupTerminalArgs,
): Promise<StartSetupTerminalResult> {
	const row = args.ctx.db
		.select({
			worktreePath: workspaces.worktreePath,
			repoPath: projects.repoPath,
			projectId: workspaces.projectId,
		})
		.from(workspaces)
		.innerJoin(projects, eq(projects.id, workspaces.projectId))
		.where(eq(workspaces.id, args.workspaceId))
		.get();

	if (!row || !row.worktreePath || !row.repoPath) {
		return { terminal: null, warning: null, chained: false };
	}

	const resolved = resolveInitialCommand({
		repoPath: row.repoPath,
		projectId: row.projectId,
		worktreePath: row.worktreePath,
	});
	if (!resolved) {
		return { terminal: null, warning: null, chained: false };
	}

	const initialCommand = args.chainCommand
		? `${resolved.initialCommand} && ${args.chainCommand}`
		: resolved.initialCommand;

	const terminalId = crypto.randomUUID();
	const result = await createTerminalSessionInternal({
		terminalId,
		workspaceId: args.workspaceId,
		db: args.ctx.db,
		eventBus: args.ctx.eventBus,
		initialCommand,
		...(resolved.cwd && { cwd: resolved.cwd }),
	});
	if ("error" in result) {
		return {
			terminal: null,
			warning: `Failed to start setup terminal: ${result.error}`,
			chained: false,
		};
	}

	return {
		terminal: {
			id: terminalId,
			role: "setup",
			label: "Workspace Setup",
		},
		warning: null,
		chained: Boolean(args.chainCommand),
	};
}

/** Exported for tests. Resolves the initial command for the setup terminal. */
export function resolveInitialCommand(args: {
	repoPath: string;
	projectId: string;
	worktreePath?: string;
	/** Override $HOME for tests. */
	homeDir?: string;
}): { initialCommand: string; cwd?: string } | null {
	const resolved = resolveScript("setup", args);
	if (!resolved) return null;

	const initialCommand =
		resolved.kind === "commands"
			? resolved.commands.join(" && ")
			: `bash ${shellSingleQuote(resolved.scriptPath)}`;
	return { initialCommand, ...(resolved.cwd && { cwd: resolved.cwd }) };
}
