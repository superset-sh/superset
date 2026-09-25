import { env } from "@/env";
import { beginOAuthFlow, STATE_COOKIES } from "@/lib/integrations/oauthFlow";
import { requireOrgMember } from "@/lib/integrations/requireOrgMember";

export async function GET(request: Request) {
	const member = await requireOrgMember(request);
	if (member instanceof Response) return member;

	if (!env.GH_APP_ID) {
		return Response.json(
			{ error: "GitHub App not configured" },
			{ status: 500 },
		);
	}

	return beginOAuthFlow({
		cookie: STATE_COOKIES.github,
		payload: { organizationId: member.organizationId, userId: member.userId },
		authorizeUrl: (state) => {
			// The slug must match GH_APP_ID: installing a different App produces
			// an installation this deployment cannot mint tokens for, which
			// surfaces much later as a 404 from
			// create-an-installation-access-token.
			const installUrl = new URL(
				`https://github.com/apps/${env.GH_APP_SLUG}/installations/new`,
			);
			installUrl.searchParams.set("state", state);
			installUrl.searchParams.set(
				"redirect_url",
				`${env.NEXT_PUBLIC_API_URL}/api/github/callback`,
			);
			return installUrl.toString();
		},
	});
}
