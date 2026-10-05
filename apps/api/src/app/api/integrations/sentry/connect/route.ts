import { env } from "@/env";
import { beginOAuthFlow, STATE_COOKIES } from "@/lib/integrations/oauthFlow";
import { requireOrgMember } from "@/lib/integrations/requireOrgMember";

/**
 * Starts a Sentry install for the org's Sentry admin.
 *
 * A public Sentry integration is installed from Sentry's side, and Sentry
 * redirects back to the app's one fixed Redirect URL with a grant code, an
 * install id and the Sentry org's slug — but no state of ours, and nothing
 * naming the Superset org. So the one place the Superset org is known is right
 * here, and it is carried to the callback in the flow's signed, first-party
 * state cookie rather than through Sentry.
 */
export async function GET(request: Request) {
	const member = await requireOrgMember(request);
	if (member instanceof Response) return member;

	if (!env.SENTRY_APP_SLUG || !env.SENTRY_CLIENT_ID) {
		return Response.redirect(
			`${env.NEXT_PUBLIC_WEB_URL}/integrations/sentry?error=not_configured`,
		);
	}

	return beginOAuthFlow({
		cookie: STATE_COOKIES.sentry,
		payload: { organizationId: member.organizationId, userId: member.userId },
		authorizeUrl: () =>
			`https://sentry.io/sentry-apps/${env.SENTRY_APP_SLUG}/external-install/`,
	});
}
