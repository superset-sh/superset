const POSTHOG_CAPTURE_URL = "https://us.i.posthog.com/i/v0/e/";
const PRODUCTION_API_URL = "https://api.superset.sh";
/** Production's public ingest key: write-only, and already shipped in the web bundle. */
const PRODUCTION_POSTHOG_KEY =
	"phc_relI1yg6V5m77qT7U3JctNKULVQLh3LkGFb3PCjeQ0P";

/**
 * Events belong to the project of the API the client talks to, as they did
 * when the API captured them: production for api.superset.sh, nothing for a
 * local or preview stack unless `SUPERSET_POSTHOG_KEY` names a project.
 */
export function resolveTelemetryKey(apiUrl: string): string | null {
	const override = process.env.SUPERSET_POSTHOG_KEY?.trim();
	if (override) return override;
	return apiUrl.replace(/\/+$/, "") === PRODUCTION_API_URL
		? PRODUCTION_POSTHOG_KEY
		: null;
}

export interface TelemetryIdentity {
	/** A user id, or a stable anonymous id when no user can be named. */
	distinctId: string;
	organizationId: string | null;
}

/**
 * Reads the user and organization from a session token without verifying it:
 * telemetry only needs a name, and the API never sees this. API keys are not
 * JWTs and belong to an organization rather than a person, so they yield
 * nothing here and the caller falls back to an anonymous id.
 */
export function readTokenIdentity(
	token: string | null | undefined,
): { userId: string; organizationId: string | null } | null {
	const payload = token?.split(".")[1];
	if (!payload) return null;
	try {
		const claims = JSON.parse(
			Buffer.from(payload, "base64url").toString("utf-8"),
		) as { sub?: unknown; organizationId?: unknown };
		if (typeof claims.sub !== "string" || !claims.sub) return null;
		return {
			userId: claims.sub,
			organizationId:
				typeof claims.organizationId === "string"
					? claims.organizationId
					: null,
		};
	} catch {
		return null;
	}
}

/** Best-effort: never throws, and a failed delivery is dropped. */
export async function captureTelemetryEvent(input: {
	key: string;
	event: string;
	identity: TelemetryIdentity;
	properties: Record<string, unknown>;
}): Promise<void> {
	const { identity } = input;
	try {
		await fetch(POSTHOG_CAPTURE_URL, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				api_key: input.key,
				event: input.event,
				distinct_id: identity.distinctId,
				properties: {
					...input.properties,
					...(identity.organizationId
						? {
								active_organization_id: identity.organizationId,
								$groups: { organization: identity.organizationId },
							}
						: {}),
				},
			}),
			signal: AbortSignal.timeout(5_000),
		});
	} catch {}
}
