/**
 * MiniMax (minimax.io) authentication resolution.
 *
 * MiniMax exposes an Anthropic-protocol endpoint at
 *   https://api.minimax.io/anthropic/v1
 * and is registered on models.dev as the "minimax" / "minimax-coding-plan" provider
 * using @ai-sdk/anthropic. So from the chat-service perspective, MiniMax uses the
 * same transport as Anthropic but with a different base URL and a different
 * auth credential store entry.
 *
 * Credentials are a single API key (no OAuth). Stored in the same auth-storage
 * file as Anthropic/OpenAI, under provider id "minimax".
 *
 * Default base URL: https://api.minimax.io/anthropic/v1
 * The user can override it in the Settings → Advanced panel (minimax.baseUrl).
 */

import { createAuthStorage } from "mastracode";
import { MINIMAX_AUTH_PROVIDER_ID } from "../provider-ids";

interface MiniMaxAuthStorageLike {
	reload: () => void;
	get: (providerId: string) => unknown;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

export interface MiniMaxCredentials {
	apiKey: string;
	providerId: typeof MINIMAX_AUTH_PROVIDER_ID;
	source: "auth-storage";
	kind: "apiKey";
}

export interface MiniMaxEnvConfig {
	/** Override the MiniMax Anthropic-protocol base URL. */
	baseUrl?: string;
	/** Extra env vars to pass through to the provider (advanced, JSON object). */
	extraEnv?: Record<string, string>;
}

/**
 * Read MiniMax credentials from the auth-storage file. Returns null if not set.
 * MiniMax has no OAuth flow — API key only.
 */
export function getMiniMaxCredentialsFromAuthStorage(
	authStorage: MiniMaxAuthStorageLike = createAuthStorage(),
): MiniMaxCredentials | null {
	try {
		authStorage.reload();
		const credential = authStorage.get(MINIMAX_AUTH_PROVIDER_ID);
		if (!isObjectRecord(credential)) {
			return null;
		}

		if (
			credential.type === "api_key" &&
			typeof credential.key === "string" &&
			credential.key.trim().length > 0
		) {
			return {
				apiKey: credential.key.trim(),
				providerId: MINIMAX_AUTH_PROVIDER_ID,
				source: "auth-storage",
				kind: "apiKey",
			};
		}
	} catch (error) {
		console.warn("[minimax/auth] Failed to read auth storage:", error);
	}
	return null;
}

/**
 * Public entry point — currently the only credential source is auth-storage.
 * Kept as a separate function (mirroring `getOpenAICredentialsFromAnySource`)
 * so we can add fallback sources (config file, env var) later without
 * changing call sites.
 */
export function getMiniMaxCredentialsFromAnySource(): MiniMaxCredentials | null {
	return getMiniMaxCredentialsFromAuthStorage();
}
