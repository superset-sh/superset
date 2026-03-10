import { createAuthStorage } from "mastracode";
import { OPENAI_AUTH_PROVIDER_IDS } from "../provider-ids";

export interface OpenAICredentials {
	apiKey: string;
	source: "auth-storage";
	kind: "apiKey" | "oauth";
	expiresAt?: number;
	accountId?: string;
}

export function isOpenAICredentialExpired(
	credential: Pick<OpenAICredentials, "kind" | "expiresAt">,
): boolean {
	return (
		credential.kind === "oauth" &&
		typeof credential.expiresAt === "number" &&
		Date.now() >= credential.expiresAt
	);
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
				const accountId =
					typeof credential.accountId === "string" &&
					credential.accountId.trim().length > 0
						? credential.accountId.trim()
						: undefined;
				return {
					apiKey: credential.access.trim(),
					source: "auth-storage",
					kind: "oauth",
					expiresAt:
						typeof credential.expires === "number"
							? credential.expires
							: undefined,
					accountId,
				};
			}
		}
	} catch (error) {
		console.warn("[openai/auth] Failed to read auth storage:", error);
	}

	return null;
}

export function getOpenAICredentialsFromAnySource(): OpenAICredentials | null {
	return getOpenAICredentialsFromAuthStorage();
}
