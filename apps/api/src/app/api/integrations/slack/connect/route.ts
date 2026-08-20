import { env } from "@/env";
import { requireOrgMember } from "@/lib/integrations/requireOrgMember";

const SLACK_SCOPES = [
	"app_mentions:read",
	"chat:write",
	"reactions:read",
	"reactions:write",
	"channels:history",
	"channels:read",
	"groups:history",
	"groups:read",
	"im:history",
	"im:read",
	"im:write",
	"mpim:history",
	"users:read",
	"files:read",
	"assistant:write",
	"links:read",
	"links:write",
].join(",");

export async function GET(request: Request) {
	const member = await requireOrgMember(request);
	if (member instanceof Response) return member;

	const redirectUri = `${env.NEXT_PUBLIC_API_URL}/api/integrations/slack/callback`;

	const slackAuthUrl = new URL("https://slack.com/oauth/v2/authorize");
	slackAuthUrl.searchParams.set("client_id", env.SLACK_CLIENT_ID);
	slackAuthUrl.searchParams.set("redirect_uri", redirectUri);
	slackAuthUrl.searchParams.set("scope", SLACK_SCOPES);
	slackAuthUrl.searchParams.set("state", member.state);

	return Response.redirect(slackAuthUrl.toString());
}
