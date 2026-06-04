export interface LocalResolvedCredential {
	kind: "api_key" | "oauth";
	expiresAt?: number;
}

export function isObjectRecord(
	value: unknown,
): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

export function isExpiredOauth(expiresAt: number | undefined): boolean {
	return typeof expiresAt === "number" && Date.now() >= expiresAt;
}

export function hasUsableCredential(
	credential: LocalResolvedCredential | null,
): boolean {
	if (!credential) return false;
	return credential.kind !== "oauth" || !isExpiredOauth(credential.expiresAt);
}
