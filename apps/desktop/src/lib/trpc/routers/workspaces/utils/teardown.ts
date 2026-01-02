import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CONFIG_FILE_NAME, PROJECT_SUPERSET_DIR_NAME } from "shared/constants";
import type { SetupConfig } from "shared/types";
import { getShellEnvironment } from "./shell-env";

const TEARDOWN_TIMEOUT_MS = 60_000; // 60 seconds
const MAX_OUTPUT_CHARS = 8_000;
const MAX_BUFFER_BYTES = 10 * 1024 * 1024;

export interface TeardownResult {
	success: boolean;
	error?: string;
}

function safeToString(value: unknown): string {
	if (typeof value === "string") return value;
	if (Buffer.isBuffer(value)) return value.toString("utf-8");
	return String(value);
}

function formatOutput(label: string, output: unknown): string | null {
	if (output === undefined || output === null) return null;
	const raw = safeToString(output).trim();
	if (raw.length === 0) return null;

	if (raw.length <= MAX_OUTPUT_CHARS) {
		return `${label}:\n${raw}`;
	}

	return `${label} (truncated to ${MAX_OUTPUT_CHARS} chars):\n${raw.slice(-MAX_OUTPUT_CHARS)}`;
}

function loadSetupConfig(mainRepoPath: string): SetupConfig | null {
	const configPath = join(
		mainRepoPath,
		PROJECT_SUPERSET_DIR_NAME,
		CONFIG_FILE_NAME,
	);

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
	// Load config from the main repo (where .superset/config.json lives)
	const config = loadSetupConfig(mainRepoPath);

	if (!config?.teardown || config.teardown.length === 0) {
		return { success: true };
	}

	const command = config.teardown.join(" && ");

	try {
		const shellEnv = await getShellEnvironment();
		console.log(
			`[workspaces/teardown] Running teardown for workspace ${workspaceName}: ${command}`,
		);

		const stdout = execSync(command, {
			cwd: worktreePath,
			timeout: TEARDOWN_TIMEOUT_MS,
			maxBuffer: MAX_BUFFER_BYTES,
			env: {
				...shellEnv,
				SUPERSET_WORKSPACE_NAME: workspaceName,
				SUPERSET_ROOT_PATH: mainRepoPath,
			},
			encoding: "utf-8",
			stdio: "pipe",
		});

		const formattedStdout = formatOutput("stdout", stdout);
		if (formattedStdout) {
			console.log(`[workspaces/teardown] ${formattedStdout}`);
		}
		console.log(`[workspaces/teardown] Completed for workspace ${workspaceName}`);

		return { success: true };
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		const errorAsUnknown = error as unknown as {
			status?: number | null;
			signal?: NodeJS.Signals | null;
			stdout?: unknown;
			stderr?: unknown;
		};

		const formattedStdout = formatOutput("stdout", errorAsUnknown.stdout);
		const formattedStderr = formatOutput("stderr", errorAsUnknown.stderr);
		const output = [formattedStdout, formattedStderr].filter(Boolean).join("\n\n");

		console.error(
			`[workspaces/teardown] Failed for workspace ${workspaceName}`,
			{
				status: errorAsUnknown.status,
				signal: errorAsUnknown.signal,
				error: errorMessage,
			},
		);
		if (output) {
			console.error(`[workspaces/teardown] ${output}`);
		}

		const statusSuffix =
			typeof errorAsUnknown.status === "number"
				? ` (exit code ${errorAsUnknown.status})`
				: "";
		return {
			success: false,
			error: `${errorMessage}${statusSuffix}`,
		};
	}
}
