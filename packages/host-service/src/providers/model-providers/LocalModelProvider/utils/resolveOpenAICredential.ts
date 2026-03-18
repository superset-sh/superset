import { createAuthStorage } from "mastracode";
import type { LocalResolvedCredential } from "./credentials";
import { isExpiredOauth, isObjectRecord } from "./credentials";

const OPENAI_PROVIDER_IDS = ["openai-codex", "openai"] as const;

export function resolveOpenAICredential(): LocalResolvedCredential | null {
	try {
		const authStorage = createAuthStorage();
		authStorage.reload();
		const credentials: LocalResolvedCredential[] = [];

		for (const providerId of OPENAI_PROVIDER_IDS) {
			const credential = authStorage.get(providerId);
			if (!isObjectRecord(credential)) continue;

			if (
				credential.type === "api_key" &&
				typeof credential.key === "string" &&
				credential.key.trim().length > 0
			) {
				credentials.push({ kind: "api_key" });
				continue;
			}

			if (
				credential.type === "oauth" &&
				typeof credential.access === "string" &&
				credential.access.trim().length > 0
			) {
				credentials.push({
					kind: "oauth",
					expiresAt:
						typeof credential.expires === "number"
							? credential.expires
							: undefined,
				});
			}
		}

		return (
			credentials.find(
				(credential) =>
					credential.kind !== "oauth" || !isExpiredOauth(credential.expiresAt),
			) ??
			credentials[0] ??
			null
		);
	} catch {
		return null;
	}
}
