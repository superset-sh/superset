import { createAuthStorage } from "mastracode";
import { OPENAI_AUTH_PROVIDER_IDS } from "../provider-ids";

interface OpenAICredentials {
	apiKey: string;
	source: "auth-storage" | "runtime-env";
	kind: "apiKey" | "oauth";
}

export function getOpenAICredentialsFromAuthStorage(): OpenAICredentials | null {
	try {
		const authStorage = createAuthStorage();
		authStorage.reload();

		for (const providerId of OPENAI_AUTH_PROVIDER_IDS) {
			const credential = authStorage.get(providerId);
			if (!credential) {
				continue;
			}

			if (
				credential.type === "api_key" &&
				typeof credential.key === "string" &&
				credential.key.trim().length > 0
			) {
				return {
					apiKey: credential.key.trim(),
					source: "auth-storage",
					kind: "apiKey",
				};
			}

			if (
				credential.type === "oauth" &&
				typeof credential.access === "string" &&
				credential.access.trim().length > 0
			) {
				return {
					apiKey: credential.access.trim(),
					source: "auth-storage",
					kind: "oauth",
				};
			}
		}
	} catch (error) {
		console.warn("[openai/auth] Failed to read auth storage:", error);
	}

	return null;
}

export function getOpenAICredentialsFromRuntimeEnv(): OpenAICredentials | null {
	const apiKey = process.env.OPENAI_API_KEY?.trim();
	if (apiKey) {
		return {
			apiKey,
			source: "runtime-env",
			kind: "apiKey",
		};
	}

	const authToken = process.env.OPENAI_AUTH_TOKEN?.trim();
	if (authToken) {
		return {
			apiKey: authToken,
			source: "runtime-env",
			kind: "oauth",
		};
	}

	return null;
}

export function getOpenAICredentialsFromAnySource(): OpenAICredentials | null {
	return (
		getOpenAICredentialsFromAuthStorage() ??
		getOpenAICredentialsFromRuntimeEnv()
	);
}
