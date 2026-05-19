import { createAuthStorage } from "mastracode";
import { OPENAI_AUTH_PROVIDER_IDS } from "../provider-ids";

interface OpenAIAuthStorageLike {
	reload: () => void;
	get: (providerId: string) => unknown;
	getApiKey: (providerId: string) => Promise<string | null | undefined>;
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

export async function getOpenAICredentialsFromAuthStorage(
	authStorage: OpenAIAuthStorageLike = createAuthStorage(),
): Promise<OpenAICredentials | null> {
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
				const resolved = await resolveOpenAIOAuthCredential(
					authStorage,
					providerId,
					credential,
				);
				credentials.push(resolved);
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

async function resolveOpenAIOAuthCredential(
	authStorage: OpenAIAuthStorageLike,
	providerId: (typeof OPENAI_AUTH_PROVIDER_IDS)[number],
	credential: Record<string, unknown>,
): Promise<OpenAICredentials> {
	const accountId =
		typeof credential.accountId === "string" &&
		credential.accountId.trim().length > 0
			? credential.accountId.trim()
			: undefined;
	const rawAccess = (credential.access as string).trim();
	const rawExpires =
		typeof credential.expires === "number" ? credential.expires : undefined;

	// mastracode's getApiKey triggers refreshToken() when expires <= now and
	// persists the refreshed credential back into auth storage. Mirror the
	// Anthropic flow so an expired OpenAI OAuth token with a valid refresh
	// token is silently refreshed instead of forcing the user to reconnect.
	try {
		const refreshedAccess = await authStorage.getApiKey(providerId);
		if (
			typeof refreshedAccess === "string" &&
			refreshedAccess.trim().length > 0
		) {
			authStorage.reload();
			const refreshed = authStorage.get(providerId);
			const refreshedExpires =
				isObjectRecord(refreshed) &&
				refreshed.type === "oauth" &&
				typeof refreshed.expires === "number"
					? refreshed.expires
					: rawExpires;
			return {
				apiKey: refreshedAccess.trim(),
				providerId,
				source: "auth-storage",
				kind: "oauth",
				expiresAt: refreshedExpires,
				accountId,
			};
		}
	} catch (error) {
		// Refresh failed (e.g. refresh token revoked). Fall through to the raw
		// credential so callers can detect it as expired and surface a
		// reconnect prompt.
		console.warn(
			`[openai/auth] OAuth refresh failed for ${providerId}, falling back to stored credential:`,
			error,
		);
	}

	return {
		apiKey: rawAccess,
		providerId,
		source: "auth-storage",
		kind: "oauth",
		expiresAt: rawExpires,
		accountId,
	};
}

export async function getOpenAICredentialsFromAnySource(): Promise<OpenAICredentials | null> {
	return getOpenAICredentialsFromAuthStorage();
}
