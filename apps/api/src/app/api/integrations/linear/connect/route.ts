import { env } from "@/env";
import { beginOAuthFlow, STATE_COOKIES } from "@/lib/integrations/oauthFlow";
import { requireOrgMember } from "@/lib/integrations/requireOrgMember";

export async function GET(request: Request) {
	const member = await requireOrgMember(request);
	if (member instanceof Response) return member;

	return beginOAuthFlow({
		cookie: STATE_COOKIES.linear,
		payload: { organizationId: member.organizationId, userId: member.userId },
		authorizeUrl: (state) => {
			const linearAuthUrl = new URL("https://linear.app/oauth/authorize");
			linearAuthUrl.searchParams.set("client_id", env.LINEAR_CLIENT_ID);
			linearAuthUrl.searchParams.set(
				"redirect_uri",
				`${env.NEXT_PUBLIC_API_URL}/api/integrations/linear/callback`,
			);
			linearAuthUrl.searchParams.set("response_type", "code");
			linearAuthUrl.searchParams.set("scope", "read,write,issues:create");
			linearAuthUrl.searchParams.set("state", state);
			return linearAuthUrl.toString();
		},
	});
}
