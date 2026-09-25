import { AGENT_SIGNING_KEY } from "@/lib/agent-identity";

// Web Bot Auth key directory (draft-meunier-web-bot-auth-architecture).
export function GET() {
	return Response.json(
		{ keys: [AGENT_SIGNING_KEY] },
		{
			headers: {
				"Content-Type": "application/http-message-signatures-directory+json",
				"Access-Control-Allow-Origin": "*",
				"Cache-Control": "public, max-age=86400, s-maxage=86400",
			},
		},
	);
}
