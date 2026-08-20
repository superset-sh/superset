import { GOOGLE_SCOPES } from "@superset/trpc/integrations/google";

import { env } from "@/env";
import { requireOrgMember } from "@/lib/integrations/requireOrgMember";

export async function GET(request: Request) {
	const member = await requireOrgMember(request);
	if (member instanceof Response) return member;

	const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
	authUrl.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
	authUrl.searchParams.set(
		"redirect_uri",
		`${env.NEXT_PUBLIC_API_URL}/api/integrations/google/callback`,
	);
	authUrl.searchParams.set("response_type", "code");
	authUrl.searchParams.set("scope", GOOGLE_SCOPES.join(" "));
	// A refresh token is only issued with offline access, and only on a
	// consent screen — a silent re-authorization returns none.
	authUrl.searchParams.set("access_type", "offline");
	authUrl.searchParams.set("prompt", "consent");
	authUrl.searchParams.set("include_granted_scopes", "true");
	authUrl.searchParams.set("state", member.state);

	return Response.redirect(authUrl.toString());
}
