import { dbWs } from "./client";
import { oauthClients } from "./schema";

/**
 * `client_id` for the official Superset CLI. The CLI binary hardcodes
 * this same literal in `packages/cli/src/lib/auth.ts`.
 *
 * A public `client_id` is an identifier, not a credential. Every major
 * CLI (`gcloud`, `gh`, `stripe`, `aws`) ships a baked-in public client_id
 * for the same reason: it lets the consent screen recognize first-party
 * clients and render them with a trusted badge instead of treating every
 * install as an anonymous self-registered stranger. PKCE binds each
 * authorization flow to the legitimate caller via the code verifier.
 */
export const SUPERSET_CLI_CLIENT_ID = "superset-cli";

/**
 * Loopback redirect URIs the CLI uses. Must stay in sync with
 * `LOOPBACK_CANDIDATES` in `packages/cli/src/lib/auth.ts`. Better Auth's
 * `oauthProvider` does exact-match comparison on redirect_uri, so all
 * candidate ports the CLI may bind to have to be enumerated here.
 */
const LOOPBACK_REDIRECT_URIS = [
	"http://127.0.0.1:51789/callback",
	"http://127.0.0.1:51790/callback",
	"http://127.0.0.1:51791/callback",
	"http://127.0.0.1:51792/callback",
	"http://127.0.0.1:51793/callback",
];

/**
 * Idempotently insert the `superset-cli` OAuth client row at API startup.
 * Called from `apps/api/src/instrumentation.ts:register()` via Next.js's
 * one-shot server bootstrap hook. Safe to call on every restart and safe
 * to call concurrently from multiple Next.js workers — the `clientId`
 * column has a unique constraint and we use `onConflictDoNothing`.
 *
 * The `metadata.trusted` flag is intended for a future consent-page PR
 * that renders first-party clients with a verified badge and treats
 * self-registered (DCR) clients as untrusted. Storing it now means no
 * backfill later.
 */
export async function seedSupersetCliOAuthClient(): Promise<void> {
	await dbWs
		.insert(oauthClients)
		.values({
			clientId: SUPERSET_CLI_CLIENT_ID,
			name: "Superset CLI",
			public: true,
			tokenEndpointAuthMethod: "none",
			type: "native",
			grantTypes: ["authorization_code", "refresh_token"],
			responseTypes: ["code"],
			redirectUris: LOOPBACK_REDIRECT_URIS,
			scopes: ["openid", "profile", "email", "offline_access"],
			metadata: { trusted: true, displayName: "Superset CLI" },
			createdAt: new Date(),
			updatedAt: new Date(),
		})
		.onConflictDoNothing({ target: oauthClients.clientId });
}
