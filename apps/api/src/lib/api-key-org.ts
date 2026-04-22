import type { auth as betterAuth } from "@superset/auth/server";
import { db } from "@superset/db/client";
import { members } from "@superset/db/schema";
import { and, eq } from "drizzle-orm";

const API_KEY_HEADER = "x-api-key";
const BEARER_API_KEY_PREFIX = "sk_live_";

function extractApiKey(req: Request): string | undefined {
	const headerKey = req.headers.get(API_KEY_HEADER);
	if (headerKey) return headerKey;

	const authorization = req.headers.get("authorization");
	const match = authorization?.match(/^Bearer\s+(.+)$/i);
	const bearer = match?.[1];
	if (bearer?.startsWith(BEARER_API_KEY_PREFIX)) return bearer;

	return undefined;
}

function parseApiKeyMetadata(
	metadata: unknown,
): Record<string, unknown> | null {
	if (!metadata) return null;

	if (typeof metadata === "string") {
		try {
			const parsed = JSON.parse(metadata);
			return parsed && typeof parsed === "object"
				? (parsed as Record<string, unknown>)
				: null;
		} catch {
			return null;
		}
	}

	return typeof metadata === "object"
		? (metadata as Record<string, unknown>)
		: null;
}

export type ApiKeyResolution =
	| { kind: "not-api-key" }
	| { kind: "no-organization-metadata" }
	| { kind: "ok"; organizationId: string }
	| { kind: "invalid" };

/**
 * Resolve the organization an api-key-authed request should operate
 * against. api keys created via `apiKeyRouter.create` store their
 * intended org in `metadata.organizationId`. Without this, the
 * api-key-synthesized session has no `activeOrganizationId` and
 * falls through to the default newest-membership resolver, which
 * silently routes requests to the wrong org when a user belongs to
 * more than one.
 *
 * Kinds:
 *   - `not-api-key`             — request is not api-key authed; caller should use session as-is
 *   - `no-organization-metadata` — legacy key without org metadata; caller should use session as-is
 *   - `ok`                      — key's org is valid and user is still a member; caller should override active org
 *   - `invalid`                 — key verification failed OR user is no longer a member of the key's org; caller should deny the request
 */
export async function resolveApiKey(
	req: Request,
	auth: typeof betterAuth,
	userId: string,
): Promise<ApiKeyResolution> {
	const apiKey = extractApiKey(req);
	if (!apiKey) return { kind: "not-api-key" };

	try {
		const result = await auth.api.verifyApiKey({ body: { key: apiKey } });
		if (!result.valid || !result.key) return { kind: "invalid" };

		const metadata = parseApiKeyMetadata(result.key.metadata);
		const organizationId = metadata?.organizationId;
		if (typeof organizationId !== "string") {
			return { kind: "no-organization-metadata" };
		}

		const membership = await db.query.members.findFirst({
			where: and(
				eq(members.userId, userId),
				eq(members.organizationId, organizationId),
			),
		});
		if (!membership) return { kind: "invalid" };

		return { kind: "ok", organizationId };
	} catch {
		return { kind: "invalid" };
	}
}
