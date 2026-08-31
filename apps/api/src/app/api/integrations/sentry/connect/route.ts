import { env } from "@/env";
import { requireOrgMember } from "@/lib/integrations/requireOrgMember";

/** How the callback recovers which Superset org started the install. */
export const SENTRY_STATE_COOKIE = "sentry_oauth_state";

/**
 * Starts a Sentry install for the org's Sentry admin.
 *
 * A public Sentry integration is installed from Sentry's side, and Sentry
 * redirects back to the app's one fixed Redirect URL with a grant code, an
 * install id and the Sentry org's slug — but no state of ours, and nothing
 * naming the Superset org. So the one place the Superset org is known is right
 * here, and it is carried to the callback in a signed, first-party cookie
 * rather than through Sentry.
 */
export async function GET(request: Request) {
	const member = await requireOrgMember(request);
	if (member instanceof Response) return member;

	if (!env.SENTRY_APP_SLUG || !env.SENTRY_CLIENT_ID) {
		return Response.redirect(
			`${env.NEXT_PUBLIC_WEB_URL}/integrations/sentry?error=not_configured`,
		);
	}

	const installUrl = `https://sentry.io/sentry-apps/${env.SENTRY_APP_SLUG}/external-install/`;

	const secure = env.NEXT_PUBLIC_API_URL.startsWith("https") ? " Secure;" : "";
	return new Response(null, {
		status: 302,
		headers: {
			Location: installUrl,
			// Scoped to the callback's path so it is sent on the top-level GET
			// redirect back and nowhere else; short-lived, like the state's TTL.
			"Set-Cookie": `${SENTRY_STATE_COOKIE}=${member.state}; HttpOnly;${secure} SameSite=Lax; Path=/api/integrations/sentry; Max-Age=600`,
		},
	});
}
