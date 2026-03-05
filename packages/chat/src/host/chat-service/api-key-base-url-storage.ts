import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const CONFIG_FILE_NAME = "chat-api-key-base-urls.json";

interface PersistedApiKeyBaseUrls {
	version: 1;
	providerBaseUrls: Record<string, string>;
}

export interface ApiKeyBaseUrlStorageOptions {
	configPath?: string;
}

function getConfigPath(options?: ApiKeyBaseUrlStorageOptions): string {
	if (options?.configPath) return options.configPath;
	const supersetHome =
		process.env.SUPERSET_HOME_DIR?.trim() || join(homedir(), ".superset");
	return join(supersetHome, CONFIG_FILE_NAME);
}

function readConfig(configPath: string): PersistedApiKeyBaseUrls {
	if (!existsSync(configPath)) {
		return { version: 1, providerBaseUrls: {} };
	}
	try {
		const raw = readFileSync(configPath, "utf-8");
		const parsed = JSON.parse(raw) as unknown;
		if (
			typeof parsed === "object" &&
			parsed !== null &&
			"providerBaseUrls" in parsed &&
			typeof (parsed as Record<string, unknown>).providerBaseUrls === "object"
		) {
			return parsed as PersistedApiKeyBaseUrls;
		}
	} catch {
		// Corrupted/invalid JSON — start fresh
	}
	return { version: 1, providerBaseUrls: {} };
}

function writeConfig(
	configPath: string,
	config: PersistedApiKeyBaseUrls,
): void {
	const dir = dirname(configPath);
	mkdirSync(dir, { recursive: true });
	writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
}

export function validateApiKeyBaseUrl(rawUrl: string): string {
	const trimmed = rawUrl.trim();
	let parsed: URL;
	try {
		parsed = new URL(trimmed);
	} catch {
		throw new Error("Invalid base URL: must be a valid URL.");
	}
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		throw new Error("Invalid base URL: must use http or https.");
	}
	return trimmed.replace(/\/$/, "");
}

export function getProviderApiKeyBaseUrl(
	providerId: string,
	options?: ApiKeyBaseUrlStorageOptions,
): string | undefined {
	const configPath = getConfigPath(options);
	const config = readConfig(configPath);
	return config.providerBaseUrls[providerId];
}

export function setProviderApiKeyBaseUrl(
	providerId: string,
	baseUrl: string,
	options?: ApiKeyBaseUrlStorageOptions,
): void {
	const configPath = getConfigPath(options);
	const config = readConfig(configPath);
	config.providerBaseUrls[providerId] = baseUrl;
	writeConfig(configPath, config);
}

export function clearProviderApiKeyBaseUrl(
	providerId: string,
	options?: ApiKeyBaseUrlStorageOptions,
): void {
	const configPath = getConfigPath(options);
	const config = readConfig(configPath);
	delete config.providerBaseUrls[providerId];
	writeConfig(configPath, config);
}
