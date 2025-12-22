import { redirect } from "next/navigation";
import { env } from "@/env";

/**
 * Initiate GitHub OAuth flow for desktop app
 *
 * GET /api/auth/github?state=xxx
 *
 * This endpoint redirects to GitHub's OAuth page with the client_id,
 * keeping credentials server-side only.
 */
export async function GET(request: Request) {
	const url = new URL(request.url);
	const state = url.searchParams.get("state");

	if (!state) {
		return Response.json({ error: "Missing state parameter" }, { status: 400 });
	}

	const authUrl = new URL("https://github.com/login/oauth/authorize");
	authUrl.searchParams.set("client_id", env.GH_CLIENT_ID);
	authUrl.searchParams.set(
		"redirect_uri",
		`${env.NEXT_PUBLIC_WEB_URL}/api/auth/desktop/github`,
	);
	authUrl.searchParams.set("scope", "user:email");
	authUrl.searchParams.set("state", state);

	redirect(authUrl.toString());
}
