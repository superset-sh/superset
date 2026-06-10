import { existsSync } from "node:fs";
import { join } from "node:path";
import { getKnownShell } from "@superset/shared/shell";
import { eq } from "drizzle-orm";
import { projects, workspaces } from "../../../../db/schema";
import {
	getResolvedSetupCommands,
	loadSetupConfig,
} from "../../../../runtime/setup/config";
import { getTerminalBaseEnv } from "../../../../terminal/env";
import { resolveLaunchShell } from "../../../../terminal/shell-launch";
import { createTerminalSessionInternal } from "../../../../terminal/terminal";
import type { HostServiceContext } from "../../../../types";
import type { TerminalDescriptor } from "./types";

const POSIX_SETUP_SCRIPT_REL_PATH = ".superset/setup.sh";
const PORTABLE_SETUP_SCRIPT_REL_PATH = ".superset/setup.ts";
const WINDOWS_SETUP_SCRIPT_REL_PATHS = [
	".superset/setup.cmd",
	".superset/setup.bat",
	".superset/setup.ps1",
] as const;

interface StartSetupTerminalArgs {
	ctx: HostServiceContext;
	workspaceId: string;
}

interface StartSetupTerminalResult {
	terminal: TerminalDescriptor | null;
	warning: string | null;
}

/**
 * Resolve and start the workspace-creation setup terminal, if any.
 *
 * Source order:
 *   1. Configured `setup` array from `.superset/config.json` (+ user override
 *      and `config.local.json` overlay) — chained for the launch shell so
 *      failures short-circuit.
 *   2. Fallback: platform-native `.superset/setup.ts`, `.cmd`, `.bat`, or
 *      `.ps1` on Windows, otherwise `bash <repoPath>/.superset/setup.sh`
 *      against the main repo (NOT the worktree — worktrees skip gitignored
 *      files, the main repo is authoritative). Scripts that need the canonical
 *      `.superset/` dir read `$SUPERSET_ROOT_PATH`, injected by the v2 terminal
 *      env builder.
 *
 * No-op when neither source resolves to anything runnable.
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
		return { terminal: null, warning: null };
	}

	const initialCommand = resolveInitialCommand({
		repoPath: row.repoPath,
		projectId: row.projectId,
		shell: resolveSetupShell(),
	});
	if (!initialCommand) {
		return { terminal: null, warning: null };
	}

	const terminalId = crypto.randomUUID();
	const result = await createTerminalSessionInternal({
		terminalId,
		workspaceId: args.workspaceId,
		db: args.ctx.db,
		eventBus: args.ctx.eventBus,
		initialCommand,
	});
	if ("error" in result) {
		return {
			terminal: null,
			warning: `Failed to start setup terminal: ${result.error}`,
		};
	}

	return {
		terminal: {
			id: terminalId,
			role: "setup",
			label: "Workspace Setup",
		},
		warning: null,
	};
}

/** Exported for tests. Resolves the initial command for the setup terminal. */
export function resolveInitialCommand(args: {
	repoPath: string;
	projectId: string;
	/** Override $HOME for tests. */
	homeDir?: string;
	platform?: NodeJS.Platform;
	shell?: string;
}): string | null {
	const platform = args.platform ?? process.platform;
	const config = loadSetupConfig(args);
	const commands = getResolvedSetupCommands(config);
	if (commands.length > 0) {
		return buildSetupCommand(commands, args.shell, platform);
	}

	if (platform === "win32") {
		const fallbackScript = resolveWindowsSetupFallbackScript(args.repoPath);
		if (!fallbackScript) return null;
		return buildWindowsSetupFallbackCommand(fallbackScript);
	}

	const portableFallbackScript = join(
		args.repoPath,
		PORTABLE_SETUP_SCRIPT_REL_PATH,
	);
	const fallbackScript = join(args.repoPath, POSIX_SETUP_SCRIPT_REL_PATH);
	if (existsSync(fallbackScript)) {
		return `bash ${singleQuote(fallbackScript)}`;
	}

	if (existsSync(portableFallbackScript)) {
		return `bun ${singleQuote(portableFallbackScript)}`;
	}

	return null;
}

export function buildSetupCommand(
	commands: string[],
	shell?: string,
	platform: NodeJS.Platform = process.platform,
): string {
	const knownShell = shell ? getKnownShell(shell) : "unknown";
	if (
		platform === "win32" &&
		(knownShell === "powershell" || knownShell === "pwsh")
	) {
		const guard =
			"if (-not $?) { if ($LASTEXITCODE -is [int] -and $LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; exit 1 }";
		return commands.map((command) => `${command}; ${guard}`).join("; ");
	}

	return commands.join(" && ");
}

export function resolveWindowsSetupFallbackScript(
	repoPath: string,
): string | null {
	const portableScript = join(repoPath, PORTABLE_SETUP_SCRIPT_REL_PATH);
	if (existsSync(portableScript)) return portableScript;

	for (const relPath of WINDOWS_SETUP_SCRIPT_REL_PATHS) {
		const scriptPath = join(repoPath, relPath);
		if (existsSync(scriptPath)) return scriptPath;
	}

	return null;
}

export function buildWindowsSetupFallbackCommand(scriptPath: string): string {
	const lowerScriptPath = scriptPath.toLowerCase();
	if (lowerScriptPath.endsWith(".ts")) {
		return `bun ${doubleQuote(scriptPath)}`;
	}
	if (lowerScriptPath.endsWith(".cmd") || lowerScriptPath.endsWith(".bat")) {
		return doubleQuote(scriptPath);
	}
	if (lowerScriptPath.endsWith(".ps1")) {
		return `powershell.exe -NoProfile -ExecutionPolicy Bypass -File ${doubleQuote(scriptPath)}`;
	}

	return doubleQuote(scriptPath);
}

/** POSIX single-quote escape: safe for any path passed through a shell. */
function singleQuote(value: string): string {
	return `'${value.replaceAll("'", "'\\''")}'`;
}

function doubleQuote(value: string): string {
	return `"${value.replaceAll('"', '\\"')}"`;
}

function resolveSetupShell(): string | undefined {
	try {
		return resolveLaunchShell(getTerminalBaseEnv());
	} catch {
		return undefined;
	}
}
