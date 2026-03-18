import { createAuthStorage } from "mastracode";
import { OPENAI_AUTH_PROVIDER_IDS } from "../provider-ids";

interface OpenAIAuthStorageLike {
	reload: () => void;
	get: (providerId: string) => unknown;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

export interface OpenAICredentials {
	apiKey: string;
	providerId: (typeof OPENAI_AUTH_PROVIDER_IDS)[number];
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

export function getOpenAICredentialsFromAuthStorage(
	authStorage: OpenAIAuthStorageLike = createAuthStorage(),
): OpenAICredentials | null {
	try {
		authStorage.reload();
		const credentials: OpenAICredentials[] = [];

		for (const providerId of OPENAI_AUTH_PROVIDER_IDS) {
			const credential = authStorage.get(providerId);
			if (!isObjectRecord(credential)) {
				continue;
			}

			if (
				credential.type === "api_key" &&
				typeof credential.key === "string" &&
				credential.key.trim().length > 0
			) {
				credentials.push({
					apiKey: credential.key.trim(),
					providerId,
					source: "auth-storage",
					kind: "apiKey",
				});
				continue;
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
				credentials.push({
					apiKey: credential.access.trim(),
					providerId,
					source: "auth-storage",
					kind: "oauth",
					expiresAt:
						typeof credential.expires === "number"
							? credential.expires
							: undefined,
					accountId,
				});
			}
		}

		return (
			credentials.find(
				(credential) => !isOpenAICredentialExpired(credential),
			) ??
			credentials[0] ??
			null
		);
	} catch (error) {
		console.warn("[openai/auth] Failed to read auth storage:", error);
	}

	return null;
}

export function getOpenAICredentialsFromAnySource(): OpenAICredentials | null {
	return getOpenAICredentialsFromAuthStorage();
}
