import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const WEBHOOK_TOKEN_PREFIX = "sset_wh_";
const SHOWN_PREFIX_LENGTH = WEBHOOK_TOKEN_PREFIX.length + 6;

export function generateWebhookToken(): { token: string; prefix: string } {
	const token = `${WEBHOOK_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
	return { token, prefix: token.slice(0, SHOWN_PREFIX_LENGTH) };
}

export function hashWebhookToken(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}

export function webhookTokenMatches(
	token: string,
	secretHash: string | null,
): boolean {
	if (!secretHash) return false;
	const presented = Buffer.from(hashWebhookToken(token), "hex");
	const stored = Buffer.from(secretHash, "hex");
	return (
		presented.length === stored.length && timingSafeEqual(presented, stored)
	);
}

export function bearerToken(authorization: string | null): string | null {
	const match = authorization?.match(/^Bearer\s+(\S+)$/i);
	return match?.[1] ?? null;
}

/**
 * The token a delivery presented, wherever it travelled. The header wins when
 * both are sent; the `token` query parameter exists for producers whose
 * webhook settings accept nothing but a URL — most SaaS products — where the
 * URL itself has to carry the credential, the way a capability URL does.
 */
export function presentedWebhookToken(
	authorization: string | null,
	requestUrl: string,
): string | null {
	const fromHeader = bearerToken(authorization);
	if (fromHeader) return fromHeader;
	try {
		return new URL(requestUrl).searchParams.get("token");
	} catch {
		return null;
	}
}
