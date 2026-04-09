import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { sshWorkspaceConfigSchema } from "@superset/local-db";
import {
	getCommandShellArgs,
	getShellEnv,
} from "main/lib/agent-setup/shell-wrappers";
import { buildSafeEnv, sanitizeEnv } from "main/lib/terminal/env";
import { SUPERSET_DIR_NAME } from "shared/constants";
import type {
	DevcontainerScriptInput,
	DevcontainerScriptOutput,
	SshConnectionConfig,
} from "./types";

export class ScriptError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ScriptError";
	}
}

export class ScriptExecutionError extends ScriptError {
	constructor(
		message: string,
		public readonly stderr: string,
		public readonly exitCode: number,
	) {
		super(message);
		this.name = "ScriptExecutionError";
	}
}

export class ScriptTimeoutError extends ScriptError {
	constructor(timeoutMs: number) {
		super(`Script timed out after ${timeoutMs}ms`);
		this.name = "ScriptTimeoutError";
	}
}

export class ScriptOutputError extends ScriptError {
	constructor(
		message: string,
		public readonly rawOutput: string,
	) {
		super(message);
		this.name = "ScriptOutputError";
	}
}

const DEVCONTAINER_TIMEOUT_MS = 300_000;
const TEARDOWN_TIMEOUT_MS = 120_000;

function getShellConfig() {
	const shell =
		process.env.SHELL ||
		(process.platform === "darwin" ? "/bin/zsh" : "/bin/bash");
	const supersetHomeDir =
		process.env.SUPERSET_HOME_DIR || join(homedir(), SUPERSET_DIR_NAME);
	const shellWrapperPaths = {
		BIN_DIR: join(supersetHomeDir, "bin"),
		ZSH_DIR: join(supersetHomeDir, "zsh"),
		BASH_DIR: join(supersetHomeDir, "bash"),
	};
	return { shell, shellWrapperPaths };
}

export class ScriptExecutor {
	runDevcontainerScript(
		script: string,
		input: DevcontainerScriptInput,
		onProgress?: (line: string) => void,
	): Promise<DevcontainerScriptOutput> {
		return new Promise((resolve, reject) => {
			const { shell, shellWrapperPaths } = getShellConfig();
			const baseEnv = buildSafeEnv(sanitizeEnv(process.env) || {});
			const wrapperEnv = getShellEnv(shell, shellWrapperPaths);
			const args = getCommandShellArgs(shell, script, shellWrapperPaths);

			const child = spawn(shell, args, {
				env: {
					...baseEnv,
					...wrapperEnv,
					SUPERSET_REPO_URL: input.repo,
					SUPERSET_BRANCH: input.branch,
					SUPERSET_BRANCH_NO_PREFIX: input.branchNoPrefix,
					SUPERSET_NEW_BRANCH: input.newBranch ? "1" : "0",
					SUPERSET_WORKSPACE_NAME: input.workspaceName,
					SUPERSET_WORKSPACE_ID: input.workspaceId,
				},
			});

			let stdoutData = "";
			let stderrData = "";
			let settled = false;

			const timeout = setTimeout(() => {
				if (settled) return;
				settled = true;
				child.kill("SIGKILL");
				reject(new ScriptTimeoutError(DEVCONTAINER_TIMEOUT_MS));
			}, DEVCONTAINER_TIMEOUT_MS);

			child.stdout.on("data", (chunk: Buffer) => {
				stdoutData += chunk.toString();
			});

			child.stderr.on("data", (chunk: Buffer) => {
				const text = chunk.toString();
				stderrData += text;
				if (onProgress) {
					for (const line of text.split("\n")) {
						if (line) onProgress(line);
					}
				}
			});

			child.on("error", (err) => {
				clearTimeout(timeout);
				if (settled) return;
				settled = true;
				reject(
					new ScriptExecutionError(
						`Failed to start script: ${err.message}`,
						stderrData,
						-1,
					),
				);
			});

			child.on("close", (exitCode) => {
				clearTimeout(timeout);
				if (settled) return;
				settled = true;

				if (exitCode !== 0) {
					reject(
						new ScriptExecutionError(
							`Script failed with exit code ${exitCode}`,
							stderrData,
							exitCode ?? 1,
						),
					);
					return;
				}

				let parsed: unknown;
				try {
					parsed = JSON.parse(stdoutData);
				} catch {
					reject(
						new ScriptOutputError(
							"Script output is not valid JSON",
							stdoutData,
						),
					);
					return;
				}

				const result = sshWorkspaceConfigSchema.safeParse(parsed);
				if (!result.success) {
					reject(
						new ScriptOutputError(
							`Script output does not match expected schema: ${result.error.message}`,
							stdoutData,
						),
					);
					return;
				}

				resolve(result.data as DevcontainerScriptOutput);
			});
		});
	}

	runTeardownScript(
		script: string,
		config: SshConnectionConfig,
		onProgress?: (line: string) => void,
	): Promise<void> {
		return new Promise((resolve) => {
			let child: ReturnType<typeof spawn>;
			try {
				const { shell, shellWrapperPaths } = getShellConfig();
				const baseEnv = buildSafeEnv(sanitizeEnv(process.env) || {});
				const wrapperEnv = getShellEnv(shell, shellWrapperPaths);
				const args = getCommandShellArgs(shell, script, shellWrapperPaths);

				child = spawn(shell, args, {
					env: {
						...baseEnv,
						...wrapperEnv,
						SUPERSET_CONTAINER_NAME: config.containerName ?? "",
						SUPERSET_HOST: config.host,
					},
				});
			} catch (err) {
				console.warn(
					"Teardown script failed:",
					err instanceof Error ? err.message : String(err),
				);
				resolve();
				return;
			}

			let stderrData = "";
			let settled = false;

			const timeout = setTimeout(() => {
				if (settled) return;
				settled = true;
				child.kill("SIGKILL");
				console.warn(
					"Teardown script failed:",
					`Script timed out after ${TEARDOWN_TIMEOUT_MS}ms`,
				);
				resolve();
			}, TEARDOWN_TIMEOUT_MS);

			child.stderr?.on("data", (chunk: Buffer) => {
				const text = chunk.toString();
				stderrData += text;
				if (onProgress) {
					for (const line of text.split("\n")) {
						if (line) onProgress(line);
					}
				}
			});

			child.on("error", (err) => {
				clearTimeout(timeout);
				if (settled) return;
				settled = true;
				console.warn("Teardown script failed:", err.message);
				resolve();
			});

			child.on("close", (exitCode) => {
				clearTimeout(timeout);
				if (settled) return;
				settled = true;

				if (exitCode !== 0) {
					console.warn(
						"Teardown script failed:",
						`Script exited with code ${exitCode}. stderr: ${stderrData}`,
					);
				}

				resolve();
			});
		});
	}
}
