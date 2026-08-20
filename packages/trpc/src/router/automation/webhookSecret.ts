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
