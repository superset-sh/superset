import { existsSync, readFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";

const ANTHROPIC_SMALL_MODEL_ID = "claude-haiku-4-5-20251001";
const OPENAI_SMALL_MODEL_ID = "gpt-4o-mini";

/**
 * Resolves the mastracode auth.json path (same logic as mastracode's
 * `getAppDataDir`). We read it directly to avoid importing mastracode,
 * which eagerly loads @mastra/fastembed → onnxruntime-node (208 MB native
 * binary) and breaks electron-vite bundling.
 */
function getAuthJsonPath(): string {
	const p = platform();
	let base: string;
	if (p === "darwin") {
		base = join(homedir(), "Library", "Application Support");
	} else if (p === "win32") {
		base = process.env.APPDATA ?? join(homedir(), "AppData", "Roaming");
	} else {
		base = process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share");
	}
	return join(base, "mastracode", "auth.json");
}

type AuthData = Record<string, unknown>;

function readAuthData(): AuthData | null {
	const path = getAuthJsonPath();
	if (!existsSync(path)) return null;
	try {
		return JSON.parse(readFileSync(path, "utf-8")) as AuthData;
	} catch {
		return null;
	}
}

function getStoredApiKey(
	authData: AuthData | null,
	providerId: string,
): string | null {
	if (!authData) return null;
	const entry = authData[`apikey:${providerId}`];
	if (
		typeof entry === "object" &&
		entry !== null &&
		"type" in entry &&
		entry.type === "api_key" &&
		"key" in entry &&
		typeof entry.key === "string" &&
		entry.key.trim().length > 0
	) {
		return entry.key.trim();
	}
	return null;
}

function resolveApiKey(
	envVar: string | undefined,
	authData: AuthData | null,
	providerId: string,
): string | null {
	const env = envVar?.trim();
	if (env) return env;
	return getStoredApiKey(authData, providerId);
}

/**
 * Returns an AI-SDK `LanguageModel` for small-model tasks (branch naming,
 * title generation). Tries Anthropic first, falls back to OpenAI. Returns
 * `null` if no credentials are available.
 *
 * Reads credentials from env vars and mastracode's auth.json directly
 * (API keys only). OAuth-only users fall back to `null`.
 */
export function getSmallModel(): unknown | null {
	const authData = readAuthData();

	const anthropicKey = resolveApiKey(
		process.env.ANTHROPIC_API_KEY,
		authData,
		"anthropic",
	);
	if (anthropicKey) {
		return createAnthropic({ apiKey: anthropicKey })(ANTHROPIC_SMALL_MODEL_ID);
	}

	const openaiKey = resolveApiKey(
		process.env.OPENAI_API_KEY,
		authData,
		"openai",
	);
	if (openaiKey) {
		return createOpenAI({ apiKey: openaiKey }).chat(OPENAI_SMALL_MODEL_ID);
	}

	return null;
}
