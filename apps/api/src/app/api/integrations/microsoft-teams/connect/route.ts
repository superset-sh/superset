import { env } from "@/env";
import { requireOrgMember } from "@/lib/integrations/requireOrgMember";

/**
 * Starts the Teams connection: an Entra admin-consent flow, not a user
 * sign-in. Everything the provider reads (channel messages, channels, teams)
 * is an application permission, which only a tenant admin can grant and which
 * grants the app the whole tenant at once. Delegated permissions are not
 * supported for tenant-wide message notifications.
 */
export async function GET(request: Request) {
	if (!env.MICROSOFT_CLIENT_ID) {
		return Response.json(
			{ error: "Microsoft Teams integration is not configured" },
			{ status: 503 },
		);
	}

	const member = await requireOrgMember(request);
	if (member instanceof Response) return member;

	// `organizations`, not `common`: personal accounts cannot grant admin
	// consent, and Microsoft's own guidance says not to use common here.
	const consentUrl = new URL(
		"https://login.microsoftonline.com/organizations/v2.0/adminconsent",
	);
	consentUrl.searchParams.set("client_id", env.MICROSOFT_CLIENT_ID);
	// `.default` requests every application permission the app registration
	// declares — the only way to request app permissions on this endpoint.
	consentUrl.searchParams.set("scope", "https://graph.microsoft.com/.default");
	consentUrl.searchParams.set(
		"redirect_uri",
		`${env.NEXT_PUBLIC_API_URL}/api/integrations/microsoft-teams/callback`,
	);
	consentUrl.searchParams.set("state", member.state);

	return Response.redirect(consentUrl.toString());
}
