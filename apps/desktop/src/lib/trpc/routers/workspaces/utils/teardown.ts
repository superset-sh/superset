import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SetupConfig } from "shared/types";

const TEARDOWN_TIMEOUT_MS = 60_000; // 60 seconds

export interface TeardownResult {
	success: boolean;
	error?: string;
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

export function runTeardown(
	mainRepoPath: string,
	worktreePath: string,
	workspaceName: string,
): TeardownResult {
	// Load config from the main repo (where .superset/config.json lives)
	const config = loadSetupConfig(mainRepoPath);

	if (!config?.teardown || config.teardown.length === 0) {
		return { success: true };
	}

	const command = config.teardown.join(" && ");

	try {
		execSync(command, {
			cwd: worktreePath,
			timeout: TEARDOWN_TIMEOUT_MS,
			env: {
				...process.env,
				SUPERSET_WORKSPACE_NAME: workspaceName,
				SUPERSET_ROOT_PATH: mainRepoPath,
			},
			stdio: "pipe",
		});

		return { success: true };
	} catch (error) {
		// execSync throws an error with stdout/stderr buffers attached
		let errorMessage = error instanceof Error ? error.message : String(error);

		// Extract stderr/stdout from execSync error for more useful error messages
		if (error && typeof error === "object") {
			const execError = error as {
				stderr?: Buffer | string;
				stdout?: Buffer | string;
			};
			const stderr = execError.stderr?.toString().trim();
			const stdout = execError.stdout?.toString().trim();

			// Prefer stderr, fall back to stdout if stderr is empty
			const output = stderr || stdout;
			if (output) {
				errorMessage = output;
			}
		}

		console.error(
			`Teardown failed for workspace ${workspaceName}:`,
			errorMessage,
		);
		return {
			success: false,
			error: errorMessage,
		};
	}
}
