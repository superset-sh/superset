import {
	existsSync,
	mkdirSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const CONFIG_PATH = join(homedir(), ".superset", "cli.json");

export interface CliConfig {
	defaultWorkspaceType: "worktree" | "branch";
	autoOpen: boolean;
	output: "text" | "json";
}

const DEFAULTS: CliConfig = {
	defaultWorkspaceType: "worktree",
	autoOpen: true,
	output: "text",
};

export const CONFIG_KEYS: Record<keyof CliConfig, string> = {
	defaultWorkspaceType: "Default workspace type (worktree | branch)",
	autoOpen: "Launch desktop app if not running (true | false)",
	output: "Output format (text | json)",
};

export function loadConfig(): CliConfig {
	if (!existsSync(CONFIG_PATH)) return { ...DEFAULTS };

	try {
		const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
		return { ...DEFAULTS, ...raw };
	} catch (e) {
		console.warn(
			`Warning: could not read CLI config at ${CONFIG_PATH}, using defaults: ${e instanceof Error ? e.message : String(e)}`,
		);
		return { ...DEFAULTS };
	}
}

export function saveConfig(config: CliConfig): void {
	const dir = dirname(CONFIG_PATH);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true, mode: 0o700 });
	}
	writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`);
}

export function resetConfig(): void {
	if (existsSync(CONFIG_PATH)) {
		unlinkSync(CONFIG_PATH);
	}
}

export function setConfigValue(key: string, value: string): CliConfig {
	const config = loadConfig();

	if (!Object.hasOwn(DEFAULTS, key)) {
		throw new Error(
			`Unknown config key: ${key}. Valid keys: ${Object.keys(DEFAULTS).join(", ")}`,
		);
	}

	const typedKey = key as keyof CliConfig;

	if (typedKey === "autoOpen") {
		if (value !== "true" && value !== "false") {
			throw new Error(
				`Invalid value for autoOpen: ${value}. Use true or false.`,
			);
		}
		config.autoOpen = value === "true";
	} else if (typedKey === "defaultWorkspaceType") {
		if (value !== "worktree" && value !== "branch") {
			throw new Error(
				`Invalid value for defaultWorkspaceType: ${value}. Use worktree or branch.`,
			);
		}
		config.defaultWorkspaceType = value;
	} else if (typedKey === "output") {
		if (value !== "text" && value !== "json") {
			throw new Error(`Invalid value for output: ${value}. Use text or json.`);
		}
		config.output = value;
	}

	saveConfig(config);
	return config;
}
