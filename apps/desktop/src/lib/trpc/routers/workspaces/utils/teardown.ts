import { spawn } from "node:child_process";
import { removeWorktree } from "./git";
import { loadSetupConfig } from "./setup";
import { getShellEnvironment } from "./shell-env";

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
	projectName,
}: {
	mainRepoPath: string;
	worktreePath: string;
	workspaceName: string;
	projectName?: string;
}): Promise<TeardownResult> {
	const config = loadSetupConfig({ mainRepoPath, worktreePath, projectName });

	if (!config?.teardown || config.teardown.length === 0) {
		console.log(
			`[teardown] No teardown commands found for "${workspaceName}" (config: ${config ? "found, no teardown field" : "not found"}, mainRepoPath: ${mainRepoPath})`,
		);
		return { success: true };
	}

	const command = config.teardown.join(" && ");
	console.log(`[teardown] Running for "${workspaceName}": ${command}`);

	try {
		const shellEnv = await getShellEnvironment();

		const shell =
			process.env.SHELL ||
			(process.platform === "darwin" ? "/bin/zsh" : "/bin/bash");

		const output = await new Promise<string>((resolve, reject) => {
			const child = spawn(shell, ["-lc", command], {
				cwd: worktreePath,
				detached: true,
				stdio: ["ignore", "pipe", "pipe"],
				env: {
					...shellEnv,
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

			// Resolve on process exit, NOT stream close — prevents hanging
			// when teardown spawns background processes that inherit stdio
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
					try {
						if (child.pid) process.kill(-child.pid, "SIGKILL");
					} catch {}
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
