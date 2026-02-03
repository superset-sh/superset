import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SetupConfig } from "shared/types";
import { getShellEnvironment } from "./shell-env";

const TEARDOWN_TIMEOUT_MS = 60_000; // 60 seconds

export interface TeardownResult {
	success: boolean;
	error?: string;
	output?: string;
}

function loadSetupConfig(mainRepoPath: string): SetupConfig | null {
	const configPath = join(mainRepoPath, ".superset", "config.json");

	if (!existsSync(configPath)) {
		return null;
	}

	try {
		const content = readFileSync(configPath, "utf-8");
		const parsed = JSON.parse(content) as SetupConfig;

		if (parsed.teardown && !Array.isArray(parsed.teardown)) {
			throw new Error("'teardown' field must be an array of strings");
		}

		return parsed;
	} catch (error) {
		console.error(
			`Failed to read setup config at ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
		);
		return null;
	}
}

export async function runTeardown(
	mainRepoPath: string,
	worktreePath: string,
	workspaceName: string,
): Promise<TeardownResult> {
	const config = loadSetupConfig(mainRepoPath);

	if (!config?.teardown || config.teardown.length === 0) {
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
