import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const CLAUDE_MODEL_ENV_KEYS = [
	"ANTHROPIC_AUTH_TOKEN",
	"ANTHROPIC_BASE_URL",
	"API_TIMEOUT_MS",
	"CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC",
	"ANTHROPIC_DEFAULT_HAIKU_MODEL",
	"ANTHROPIC_DEFAULT_SONNET_MODEL",
	"ANTHROPIC_DEFAULT_OPUS_MODEL",
	"CLAUDE_CODE_DISABLE_1M_CONTEXT",
] as const;

export type ClaudeModelEnvKey = (typeof CLAUDE_MODEL_ENV_KEYS)[number];

export interface ClaudeSettingsMergeResult {
	text: string;
	replacedInvalidJson: boolean;
	replacedNonObjectEnv: boolean;
	preservedEnvKeys: string[];
}

export interface ClaudeSettingsWriteResult extends ClaudeSettingsMergeResult {
	settingsPath: string;
	createdClaudeDirectory: boolean;
	createdSettingsFile: boolean;
	writtenEnvKeys: ClaudeModelEnvKey[];
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function mergeClaudeSettingsLocalJson(
	existingText: string | null,
	env: Record<ClaudeModelEnvKey, string>,
): ClaudeSettingsMergeResult {
	let root: Record<string, unknown> = {};
	let replacedInvalidJson = false;

	if (existingText?.trim()) {
		try {
			const parsed = JSON.parse(existingText) as unknown;
			if (isObjectRecord(parsed)) {
				root = parsed;
			} else {
				replacedInvalidJson = true;
			}
		} catch {
			replacedInvalidJson = true;
		}
	}

	const existingEnv = root.env;
	const replacedNonObjectEnv =
		existingEnv !== undefined && !isObjectRecord(existingEnv);
	const nextEnv: Record<string, unknown> = replacedNonObjectEnv
		? {}
		: { ...(isObjectRecord(existingEnv) ? existingEnv : {}) };
	const preservedEnvKeys = Object.keys(nextEnv).filter(
		(key) => !CLAUDE_MODEL_ENV_KEYS.includes(key as ClaudeModelEnvKey),
	);

	for (const [key, value] of Object.entries(env)) {
		nextEnv[key] = value;
	}
	root.env = nextEnv;

	return {
		text: `${JSON.stringify(root, null, "\t")}\n`,
		replacedInvalidJson,
		replacedNonObjectEnv,
		preservedEnvKeys,
	};
}

export function writeClaudeSettingsLocalJson(args: {
	worktreePath: string;
	env: Record<ClaudeModelEnvKey, string>;
}): ClaudeSettingsWriteResult {
	const claudeDir = path.join(args.worktreePath, ".claude");
	const settingsPath = path.join(claudeDir, "settings.local.json");
	let createdClaudeDirectory = false;
	let createdSettingsFile = false;

	try {
		mkdirSync(claudeDir, { recursive: false, mode: 0o700 });
		createdClaudeDirectory = true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
	}

	let existingText: string | null = null;
	try {
		existingText = readFileSync(settingsPath, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		createdSettingsFile = true;
	}

	const merged = mergeClaudeSettingsLocalJson(existingText, args.env);
	writeFileSync(settingsPath, merged.text, { encoding: "utf8", mode: 0o600 });
	return {
		...merged,
		settingsPath,
		createdClaudeDirectory,
		createdSettingsFile,
		writtenEnvKeys: [...CLAUDE_MODEL_ENV_KEYS],
	};
}
