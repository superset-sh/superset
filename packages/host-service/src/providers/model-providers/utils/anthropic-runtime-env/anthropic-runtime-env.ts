import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ENV_LINE = /^(?:export\s+)?[a-zA-Z_]\w*\s*=/;
const CONFIG_FILE_NAME = "chat-anthropic-env.json";
const ENV_KEY = /^[a-zA-Z_]\w*$/;

export type AnthropicEnvVariables = Record<string, string>;

interface AnthropicEnvConfigDiskOptions {
	configPath?: string;
}

interface PersistedAnthropicEnvConfig {
	version: 1;
	envText: string;
}

const INVALID_ENV_MESSAGE = "Please provide a valid .env block.";

function trimToUndefined(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	if (!trimmed) return undefined;
	return trimmed;
}

function parseLineValue(rawValue: string): string {
	const value = rawValue.trim();
	if (
		(value.startsWith('"') && value.endsWith('"')) ||
		(value.startsWith("'") && value.endsWith("'"))
	) {
		return value.slice(1, -1);
	}
	return value;
}

function normalizeAnthropicBaseUrl(
	rawBaseUrl: string | undefined,
): string | undefined {
	const baseUrl = trimToUndefined(rawBaseUrl);
	if (!baseUrl) return undefined;

	try {
		const parsed = new URL(baseUrl);
		const normalizedHost = parsed.hostname.toLowerCase();
		const pathname = parsed.pathname.replace(/\/+$/, "");
		if (normalizedHost === "ai-gateway.vercel.sh" && pathname.length === 0) {
			parsed.pathname = "/v1";
		}
		return parsed.toString().replace(/\/$/, "");
	} catch {
		return baseUrl;
	}
}

function toNormalizedEnvEntries(
	variables: AnthropicEnvVariables,
): Array<[string, string]> {
	return Object.entries(variables)
		.map(([key, value]) => [key.trim(), value] as [string, string])
		.filter(([key]) => ENV_KEY.test(key));
}

function readPersistedAnthropicEnvConfig(
	options?: AnthropicEnvConfigDiskOptions,
): PersistedAnthropicEnvConfig | null {
	const configPath = getAnthropicEnvConfigPath(options);
	if (!existsSync(configPath)) return null;

	try {
		const parsed = JSON.parse(
			readFileSync(configPath, "utf-8"),
		) as Partial<PersistedAnthropicEnvConfig>;
		if (parsed.version !== 1 || typeof parsed.envText !== "string") {
			return null;
		}

		return {
			version: 1,
			envText: parsed.envText,
		};
	} catch {
		return null;
	}
}

export function getAnthropicEnvConfigPath(
	options?: AnthropicEnvConfigDiskOptions,
): string {
	if (options?.configPath) return options.configPath;
	const supersetHome =
		process.env.SUPERSET_HOME_DIR?.trim() || join(homedir(), ".superset");
	return join(supersetHome, CONFIG_FILE_NAME);
}

export function parseAnthropicEnvText(envText: string): AnthropicEnvVariables {
	if (envText.includes("\0")) {
		throw new Error(INVALID_ENV_MESSAGE);
	}

	const variables: AnthropicEnvVariables = {};
	const lines = envText.split("\n");
	for (const [index, rawLine] of lines.entries()) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) continue;
		if (!ENV_LINE.test(line)) {
			throw new Error(`${INVALID_ENV_MESSAGE} Invalid line ${index + 1}.`);
		}

		const eqIndex = line.indexOf("=");
		if (eqIndex === -1) {
			throw new Error(`${INVALID_ENV_MESSAGE} Invalid line ${index + 1}.`);
		}

		const key = line
			.slice(0, eqIndex)
			.trim()
			.replace(/^export\s+/, "");
		if (!ENV_KEY.test(key)) {
			throw new Error(`${INVALID_ENV_MESSAGE} Invalid line ${index + 1}.`);
		}

		variables[key] = parseLineValue(line.slice(eqIndex + 1));
	}

	return variables;
}

export function getAnthropicEnvConfig(
	options?: AnthropicEnvConfigDiskOptions,
): {
	envText: string;
	variables: AnthropicEnvVariables;
} {
	const persisted = readPersistedAnthropicEnvConfig(options);
	if (!persisted) {
		return {
			envText: "",
			variables: {},
		};
	}

	try {
		return {
			envText: persisted.envText,
			variables: parseAnthropicEnvText(persisted.envText),
		};
	} catch {
		return {
			envText: "",
			variables: {},
		};
	}
}

export function stripAnthropicCredentialEnvVariables(
	variables: AnthropicEnvVariables,
): AnthropicEnvVariables {
	const nextVariables = { ...variables };
	delete nextVariables.ANTHROPIC_API_KEY;
	delete nextVariables.ANTHROPIC_AUTH_TOKEN;
	return nextVariables;
}

export function buildAnthropicRuntimeEnv(
	variables: AnthropicEnvVariables,
): Record<string, string> {
	const runtimeEnv = Object.fromEntries(toNormalizedEnvEntries(variables));
	const baseUrl = normalizeAnthropicBaseUrl(runtimeEnv.ANTHROPIC_BASE_URL);
	if (baseUrl) {
		runtimeEnv.ANTHROPIC_BASE_URL = baseUrl;
	}
	return runtimeEnv;
}
