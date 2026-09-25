import { z } from "zod";

/**
 * The Worker's configuration. The schema is the single source of truth for
 * everything that is a string; `PRIVATE` is a live R2 binding wrangler
 * injects, which no schema can describe, so it rides on the type instead.
 * Validated once per isolate — a misconfigured deploy fails loudly on its
 * first request instead of serving with a broken secret or URL.
 */
const envSchema = z.object({
	/** Base URL framed content hangs off, e.g. https://frame.supersetusercontent.com */
	USERCONTENT_URL: z.string().url(),
	/** Base URL for app-referenced files, e.g. https://media.supersetusercontent.com */
	MEDIA_URL: z.string().url(),
	/** Where a reader without a ticket is sent to sign in and come back. */
	APP_URL: z.string().url(),
	/** Space-separated CSP sources allowed to frame a page. */
	FRAME_ANCESTORS: z.string().min(1),
	/** Shared with the API, which mints the tickets this origin verifies. */
	USERCONTENT_TOKEN_SECRET: z.string().min(32),
	/** Set during rotation so tickets signed with the old secret still open. */
	USERCONTENT_TOKEN_SECRET_PREVIOUS: z.string().min(32).optional(),
	/** Optional; Sentry capture is a no-op until the secret is set. */
	SENTRY_DSN: z.string().url().optional(),
});

export type UsercontentEnv = z.infer<typeof envSchema> & {
	/** Pages and files: read only through this Worker, with a ticket. */
	PRIVATE: R2Bucket;
};

const validated = new WeakSet<object>();

export function assertEnv(env: UsercontentEnv): void {
	if (validated.has(env)) return;
	envSchema.parse(env);
	validated.add(env);
}
