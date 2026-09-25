import { env } from "@/env";
import { beginOAuthFlow, STATE_COOKIES } from "@/lib/integrations/oauthFlow";
import { requireOrgMember } from "@/lib/integrations/requireOrgMember";

export async function GET(request: Request) {
	if (!env.NOTION_CLIENT_ID) {
		return Response.json(
			{ error: "Notion integration is not configured" },
			{ status: 503 },
		);
	}

	const member = await requireOrgMember(request);
	if (member instanceof Response) return member;

	const clientId = env.NOTION_CLIENT_ID;
	return beginOAuthFlow({
		cookie: STATE_COOKIES.notion,
		payload: { organizationId: member.organizationId, userId: member.userId },
		authorizeUrl: (state) => {
			const notionAuthUrl = new URL(
				"https://api.notion.com/v1/oauth/authorize",
			);
			notionAuthUrl.searchParams.set("client_id", clientId);
			notionAuthUrl.searchParams.set(
				"redirect_uri",
				`${env.NEXT_PUBLIC_API_URL}/api/integrations/notion/callback`,
			);
			notionAuthUrl.searchParams.set("response_type", "code");
			// The only value Notion accepts; a workspace is authorized by one of
			// its members, whose identity comes back as `owner`.
			notionAuthUrl.searchParams.set("owner", "user");
			notionAuthUrl.searchParams.set("state", state);
			return notionAuthUrl.toString();
		},
	});
}
