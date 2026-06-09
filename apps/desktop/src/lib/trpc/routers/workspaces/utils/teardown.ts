import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { getKnownShell } from "@superset/shared/shell";
import {
	getCommandShellArgs,
	getShellEnv,
} from "main/lib/agent-setup/shell-wrappers";
import { buildSafeEnv, sanitizeEnv } from "main/lib/terminal/env";
import { SUPERSET_DIR_NAME } from "shared/constants";
import { removeWorktree } from "./git";
import { loadSetupConfig } from "./setup";

const TEARDOWN_TIMEOUT_MS = 60_000;

export interface TeardownResult {
	success: boolean;
	error?: string;
	output?: string;
}

export async function runTeardown({
	mainRepoPath,
	worktreePath,
	workspaceName,
	projectId,
}: {
	mainRepoPath: string;
	worktreePath: string;
	workspaceName: string;
	projectId?: string;
}): Promise<TeardownResult> {
	const config = loadSetupConfig({ mainRepoPath, worktreePath, projectId });

	if (!config?.teardown || config.teardown.length === 0) {
		console.log(
			`[teardown] No teardown commands found for "${workspaceName}" (config: ${config ? "found, no teardown field" : "not found"}, mainRepoPath: ${mainRepoPath})`,
		);
		return { success: true };
	}

	try {
		const shell = resolveTeardownShell();
		const command = buildTeardownCommand(config.teardown, shell);
		console.log(`[teardown] Running for "${workspaceName}": ${command}`);
		const supersetHomeDir =
			process.env.SUPERSET_HOME_DIR || join(homedir(), SUPERSET_DIR_NAME);
		const shellWrapperPaths = {
			BIN_DIR: join(supersetHomeDir, "bin"),
			ZSH_DIR: join(supersetHomeDir, "zsh"),
			BASH_DIR: join(supersetHomeDir, "bash"),
		};

		const baseEnv = buildSafeEnv(sanitizeEnv(process.env) || {});
		const wrapperEnv = getShellEnv(shell, shellWrapperPaths);
		if (process.platform === "win32") {
			prependPathForWindows(wrapperEnv, shellWrapperPaths.BIN_DIR, baseEnv);
		}
		const args = getCommandShellArgs(shell, command, shellWrapperPaths);
		const useVerbatimCmdArgs =
			process.platform === "win32" && getKnownShell(shell) === "cmd";

		const output = await new Promise<string>((resolve, reject) => {
			const child = spawn(shell, args, {
				cwd: worktreePath,
				detached: true,
				stdio: ["ignore", "pipe", "pipe"],
				windowsVerbatimArguments: useVerbatimCmdArgs,
				env: {
					...baseEnv,
					...wrapperEnv,
					SUPERSET_WORKSPACE_NAME: workspaceName,
					SUPERSET_ROOT_PATH: mainRepoPath,
				},
			});

			let combined = "";
			child.stdout?.on("data", (chunk: Buffer) => {
				const text = chunk.toString();
				combined += text;
				for (const line of text.trimEnd().split("\n")) {
					console.log(`[teardown/stdout] ${line}`);
				}
			});
			child.stderr?.on("data", (chunk: Buffer) => {
				const text = chunk.toString();
				combined += text;
				for (const line of text.trimEnd().split("\n")) {
					console.log(`[teardown/stderr] ${line}`);
				}
			});

			let settled = false;
			const settle = (fn: () => void) => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				fn();
			};

			// "exit" not "close" — background children may hold stdio open
			child.on("exit", (code) => {
				settle(() => {
					if (code === 0) resolve(combined);
					else
						reject(new Error(`Teardown exited with code ${code}: ${combined}`));
				});
			});

			child.on("error", (err) => {
				console.error(`[teardown] Process error:`, err.message);
				settle(() => reject(err));
			});

			const timer = setTimeout(() => {
				settle(() => {
					console.error(
						`[teardown] Timed out after ${TEARDOWN_TIMEOUT_MS}ms, killing process group`,
					);
					killTeardownProcess(child);
					reject(
						new Error(`Teardown timed out after ${TEARDOWN_TIMEOUT_MS}ms`),
					);
				});
			}, TEARDOWN_TIMEOUT_MS);
			timer.unref();
		});

		return { success: true, output: output || undefined };
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		console.error(
			`Teardown failed for workspace ${workspaceName}:`,
			errorMessage,
		);
		return {
			success: false,
			error: errorMessage,
			output: errorMessage,
		};
	}
}

export function resolveTeardownShell(
	platform: NodeJS.Platform = process.platform,
	env: NodeJS.ProcessEnv = process.env,
): string {
	if (platform === "win32") {
		return env.COMSPEC || env.ComSpec || "cmd.exe";
	}
	return env.SHELL || (platform === "darwin" ? "/bin/zsh" : "/bin/bash");
}

export function buildTeardownCommand(
	commands: string[],
	shell: string,
	platform: NodeJS.Platform = process.platform,
): string {
	const knownShell = getKnownShell(shell);
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

function prependPathForWindows(
	targetEnv: Record<string, string>,
	binDir: string,
	baseEnv: Record<string, string>,
): void {
	const currentPath =
		targetEnv.Path ?? targetEnv.PATH ?? baseEnv.Path ?? baseEnv.PATH ?? "";
	const nextPath = currentPath ? `${binDir};${currentPath}` : binDir;
	targetEnv.Path = nextPath;
	targetEnv.PATH = nextPath;
}

function killTeardownProcess(child: ChildProcess): void {
	if (!child.pid) return;
	if (process.platform === "win32") {
		spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
			stdio: "ignore",
			timeout: 5000,
		});
		return;
	}
	try {
		process.kill(-child.pid, "SIGKILL");
	} catch {
		// Already exited.
	}
}

export async function removeWorktreeFromDisk({
	mainRepoPath,
	worktreePath,
}: {
	mainRepoPath: string;
	worktreePath: string;
}): Promise<{ success: true } | { success: false; error: string }> {
	try {
		await removeWorktree(mainRepoPath, worktreePath);
		return { success: true };
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		if (
			msg.includes("is not a working tree") ||
			msg.includes("No such file or directory")
		) {
			console.warn(
				`Worktree ${worktreePath} not found in git, skipping removal`,
			);
			return { success: true };
		}
		console.error("Failed to remove worktree:", msg);
		return { success: false, error: `Failed to remove worktree: ${msg}` };
	}
}
