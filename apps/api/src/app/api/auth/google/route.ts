import { redirect } from "next/navigation";
import { env } from "@/env";

/**
 * Initiate Google OAuth flow for desktop app
 *
 * GET /api/auth/google?state=xxx
 *
 * This endpoint redirects to Google's OAuth page with the client_id,
 * keeping credentials server-side only.
 */
export async function GET(request: Request) {
	const url = new URL(request.url);
	const state = url.searchParams.get("state");

	if (!state) {
		return Response.json({ error: "Missing state parameter" }, { status: 400 });
	}

	const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
	authUrl.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
	authUrl.searchParams.set(
		"redirect_uri",
		`${env.NEXT_PUBLIC_WEB_URL}/api/auth/desktop/google`,
	);
	authUrl.searchParams.set("response_type", "code");
	authUrl.searchParams.set("scope", "openid email profile");
	authUrl.searchParams.set("state", state);
	authUrl.searchParams.set("prompt", "select_account");
	authUrl.searchParams.set("access_type", "online");

	redirect(authUrl.toString());
}
