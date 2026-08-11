import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const ENV_LINE = /^(?:export\s+)?[a-zA-Z_]\w*\s*=/;
const CONFIG_FILE_NAME = "chat-anthropic-env.json";
const ENV_KEY = /^[a-zA-Z_]\w*$/;

export type AnthropicEnvVariables = Record<string, string>;

interface PersistedAnthropicEnvConfig {
	version: 1;
	envText: string;
}

interface AnthropicEnvConfigDiskOptions {
	configPath?: string;
}

export type AnthropicRuntimeEnv = Record<string, string>;

interface ApplyAnthropicRuntimeEnvOptions {
	previousRuntimeEnv?: AnthropicRuntimeEnv;
}

const INVALID_ENV_MESSAGE = "Please provide a valid .env block.";

function trimToUndefined(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	if (!trimmed) return undefined;
	return trimmed;
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
	} catch (error) {
		console.warn(
			"[chat-service][anthropic-env] Invalid ANTHROPIC_BASE_URL; using raw value.",
			{ error: error instanceof Error ? error.message : String(error) },
		);
		return baseUrl;
	}
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

function toNormalizedEnvEntries(
	variables: AnthropicEnvVariables,
): Array<[string, string]> {
	return Object.entries(variables)
		.map(([key, value]) => [key.trim(), value] as [string, string])
		.filter(([key]) => ENV_KEY.test(key));
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

		const parsedValue = parseLineValue(line.slice(eqIndex + 1));
		variables[key] = parsedValue;
	}

	return variables;
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
	} catch (error) {
		console.warn(
			"[chat-service][anthropic-env] Failed to read persisted env config.",
			{
				configPath,
				error: error instanceof Error ? error.message : String(error),
			},
		);
		return null;
	}
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
	} catch (error) {
		console.warn(
			"[chat-service][anthropic-env] Persisted env config is invalid and will be ignored.",
			{
				configPath: getAnthropicEnvConfigPath(options),
				error: error instanceof Error ? error.message : String(error),
			},
		);
		return {
			envText: "",
			variables: {},
		};
	}
}

export function setAnthropicEnvConfig(
	input: { envText: string },
	options?: AnthropicEnvConfigDiskOptions,
): AnthropicEnvVariables {
	const variables = parseAnthropicEnvText(input.envText);
	const configPath = getAnthropicEnvConfigPath(options);
	const dir = dirname(configPath);
	mkdirSync(dir, { recursive: true, mode: 0o700 });

	const persisted: PersistedAnthropicEnvConfig = {
		version: 1,
		envText: input.envText.trim(),
	};
	writeFileSync(configPath, JSON.stringify(persisted, null, 2), "utf-8");
	chmodSync(configPath, 0o600);
	return variables;
}

export function clearAnthropicEnvConfig(
	options?: AnthropicEnvConfigDiskOptions,
): void {
	const configPath = getAnthropicEnvConfigPath(options);
	rmSync(configPath, { force: true });
}

export function buildAnthropicRuntimeEnv(
	variables: AnthropicEnvVariables,
): AnthropicRuntimeEnv {
	const runtimeEnv = Object.fromEntries(toNormalizedEnvEntries(variables));
	const baseUrl = normalizeAnthropicBaseUrl(runtimeEnv.ANTHROPIC_BASE_URL);
	if (baseUrl) {
		runtimeEnv.ANTHROPIC_BASE_URL = baseUrl;
	}
	return runtimeEnv;
}

export function applyAnthropicRuntimeEnv(
	runtimeEnv: AnthropicRuntimeEnv,
	options?: ApplyAnthropicRuntimeEnvOptions,
): void {
	const nextEntries = toNormalizedEnvEntries(runtimeEnv);
	const previousEntries = toNormalizedEnvEntries(
		options?.previousRuntimeEnv ?? {},
	);
	const nextKeys = new Set(nextEntries.map(([key]) => key));

	for (const [key] of previousEntries) {
		if (!nextKeys.has(key)) {
			delete process.env[key];
		}
	}
	for (const [key, value] of nextEntries) {
		process.env[key] = value;
	}
}
