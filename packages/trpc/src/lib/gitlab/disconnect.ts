import { assertGitLabOAuthOrigin } from "./oauth-origin";
import { safeGitLabFetch } from "./transport";

export async function revokeGitlabOAuth(
	host: string,
	token: string,
	credentials: {
		clientId: string | undefined;
		clientSecret: string | undefined;
		issuer?: string;
	},
	send = safeGitLabFetch,
): Promise<void> {
	if (!credentials.clientId || !credentials.clientSecret)
		throw new Error("GitLab OAuth is not configured");
	if (!/^[!-~]+$/.test(token)) throw new Error("Invalid GitLab OAuth token");
	const origin = assertGitLabOAuthOrigin(`https://${host}`, credentials.issuer);
	const response = await send(`${origin}/oauth/revoke`, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			token,
			client_id: credentials.clientId,
			client_secret: credentials.clientSecret,
		}),
	});
	if (!response.ok)
		throw new Error(`GitLab grant revocation failed: ${response.status}`);
}
