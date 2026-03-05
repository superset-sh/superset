import { createAnthropic } from "@ai-sdk/anthropic";
import { Agent } from "@mastra/core/agent";
import {
	getCredentialsFromConfig,
	getCredentialsFromKeychain,
} from "@superset/chat/host";
import { createAuthStorage } from "mastracode";

function getCredentialFromAuthStorage(): string | null {
	try {
		const authStorage = createAuthStorage();
		authStorage.reload();
		const credential = authStorage.get("anthropic");
		if (!credential) return null;

		if (
			credential.type === "api_key" &&
			typeof credential.key === "string" &&
			credential.key.trim().length > 0
		) {
			return credential.key.trim();
		}

		if (
			credential.type === "oauth" &&
			typeof credential.access === "string" &&
			credential.access.trim().length > 0
		) {
			return credential.access.trim();
		}
	} catch (error) {
		console.warn("[workspace-ai-name] failed to read auth storage", error);
	}

	return null;
}

function getCredentialFromRuntimeEnv(): string | null {
	const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
	if (apiKey) return apiKey;

	const authToken = process.env.ANTHROPIC_AUTH_TOKEN?.trim();
	if (authToken) return authToken;

	return null;
}

export async function generateWorkspaceNameFromPrompt(
	prompt: string,
): Promise<string | null> {
	try {
		const configCredentials = getCredentialsFromConfig();
		const keychainCredentials =
			configCredentials === null ? getCredentialsFromKeychain() : null;
		const authStorageCredential =
			configCredentials === null && keychainCredentials === null
				? getCredentialFromAuthStorage()
				: null;
		const runtimeEnvCredential =
			configCredentials === null &&
			keychainCredentials === null &&
			authStorageCredential === null
				? getCredentialFromRuntimeEnv()
				: null;
		const credentialSource = configCredentials
			? "config"
			: keychainCredentials
				? "keychain"
				: authStorageCredential
					? "auth-storage"
					: runtimeEnvCredential
						? "runtime-env"
						: null;
		const apiKey =
			configCredentials?.apiKey ??
			keychainCredentials?.apiKey ??
			authStorageCredential ??
			runtimeEnvCredential ??
			null;

		console.debug("[workspace-ai-name] generate start", {
			promptLength: prompt.length,
			credentialSource,
		});
		if (!apiKey) {
			console.warn("[workspace-ai-name] missing credentials");
			return null;
		}

		const anthropic = createAnthropic({ apiKey });

		const agent = new Agent({
			id: "workspace-namer",
			name: "Workspace Namer",
			instructions: "You generate concise workspace titles.",
			model: anthropic("claude-haiku-4-5-20251001"),
		});

		const title = await agent.generateTitleFromUserMessage({
			message: prompt,
			tracingContext: {},
		});

		const trimmedTitle = title?.trim() || null;
		console.debug("[workspace-ai-name] generate complete", {
			hasTitle: Boolean(trimmedTitle),
			titleLength: trimmedTitle?.length ?? 0,
		});
		return trimmedTitle;
	} catch (error) {
		console.warn("[workspace-ai-name] generate failed", error);
		return null;
	}
}
