import { auth } from "@superset/auth/server";
import { db } from "@superset/db/client";
import { oauthClients } from "@superset/db/schema/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { eq } from "drizzle-orm";

const { GET: _GET, POST: _POST } = toNextJsHandler(auth);

const GET = async (req: Request) => {
	const url = new URL(req.url);
	if (url.pathname.endsWith("/oauth2/authorize")) {
		const clientId = url.searchParams.get("client_id");
		const redirectUri = url.searchParams.get("redirect_uri");
		console.log("[oauth/authorize] --- DEBUG START ---");
		console.log("[oauth/authorize] client_id:", clientId);
		console.log("[oauth/authorize] redirect_uri:", JSON.stringify(redirectUri));
		console.log("[oauth/authorize] redirect_uri type:", typeof redirectUri);
		if (clientId) {
			try {
				const client = await db.query.oauthClients.findFirst({
					where: eq(oauthClients.clientId, clientId),
					columns: {
						clientId: true,
						redirectUris: true,
						name: true,
					},
				});
				console.log("[oauth/authorize] DB client found:", !!client);
				console.log(
					"[oauth/authorize] DB redirectUris raw:",
					JSON.stringify(client?.redirectUris),
				);
				console.log(
					"[oauth/authorize] DB redirectUris type:",
					typeof client?.redirectUris,
				);
				console.log(
					"[oauth/authorize] DB redirectUris isArray:",
					Array.isArray(client?.redirectUris),
				);
				if (client?.redirectUris && redirectUri) {
					console.log(
						"[oauth/authorize] Exact match (.includes):",
						client.redirectUris.includes(redirectUri),
					);
					console.log(
						"[oauth/authorize] Exact match (.find):",
						!!client.redirectUris.find((u: string) => u === redirectUri),
					);
					for (const [i, uri] of client.redirectUris.entries()) {
						console.log(
							`[oauth/authorize] URI[${i}]:`,
							JSON.stringify(uri),
							"type:",
							typeof uri,
							"match:",
							uri === redirectUri,
						);
					}
				}
				// Also test via Better Auth adapter
				const baClient = await auth.api.getOAuthClientPublic({
					query: { client_id: clientId },
				});
				console.log(
					"[oauth/authorize] BA client redirect_uris:",
					JSON.stringify(
						baClient && "redirect_uris" in baClient
							? baClient.redirect_uris
							: "N/A",
					),
				);
			} catch (error) {
				console.error("[oauth/authorize] Debug query failed:", error);
			}
		}
		console.log("[oauth/authorize] --- DEBUG END ---");
	}
	return _GET(req);
};

const POST = async (req: Request) => {
	const url = new URL(req.url);
	if (url.pathname.endsWith("/oauth2/register")) {
		const body = await req
			.clone()
			.json()
			.catch(() => null);
		console.log("[oauth/register] --- DEBUG START ---");
		console.log(
			"[oauth/register] redirect_uris:",
			JSON.stringify(body?.redirect_uris),
		);
		console.log("[oauth/register] client_name:", body?.client_name);
		console.log("[oauth/register] --- DEBUG END ---");
	}
	return _POST(req);
};

export { GET, POST };
