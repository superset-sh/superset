import { assertGitLabOAuthOrigin } from "@superset/trpc/lib/gitlab/oauth-origin";
import { assertSafeGitLabHost } from "@superset/trpc/lib/gitlab/ssrf";
import { env } from "@/env";
import { requireOrgMember } from "@/lib/integrations/requireOrgMember";
import { connectFailureCode, identifyToken } from "../gitlab-api";
import { completeGitlabConnection } from "../lifecycle";
import { gitlabMutationRequest } from "../mutation-origin";
import { beginGitlabOAuthFlow } from "../oauth-state";
import { redirectGitLab } from "../redirect";

export async function GET(_request: Request): Promise<Response> {
	return new Response(null, { status: 405, headers: { Allow: "POST" } });
}

export async function POST(request: Request): Promise<Response> {
	const authenticatedRequest = gitlabMutationRequest(request, [
		env.NEXT_PUBLIC_API_URL,
		env.NEXT_PUBLIC_WEB_URL,
	]);
	if (!authenticatedRequest)
		return Response.json({ error: "Invalid request origin" }, { status: 403 });
	const member = await requireOrgMember(authenticatedRequest, {
		requireAdmin: true,
	});
	if (member instanceof Response) return redirectGitLab({ error: "sign_in" });
	const redirect = (params: Parameters<typeof redirectGitLab>[0]) =>
		redirectGitLab(params, member);
	let form: FormData;
	try {
		form = await authenticatedRequest.formData();
	} catch {
		return redirect({ error: "token_rejected" });
	}
	const oauth = form.get("mode") === "oauth";
	if (oauth && (!env.GITLAB_OAUTH_CLIENT_ID || !env.GITLAB_OAUTH_CLIENT_SECRET))
		return redirect({ error: "oauth_not_configured" });
	const token = String(form.get("token") ?? "");
	const groupPath = String(form.get("groupPath") ?? "");
	if (!oauth && !token) return redirect({ error: "token_rejected" });
	if (!groupPath) return redirect({ error: "path_not_found" });
	let origin: string;
	try {
		origin = await assertSafeGitLabHost(
			String(form.get("host") ?? "gitlab.com"),
			undefined,
			env.GITLAB_ISSUER,
		);
		if (oauth) assertGitLabOAuthOrigin(origin, env.GITLAB_ISSUER);
	} catch {
		return redirect({ error: "host_not_allowed" });
	}
	if (oauth) {
		try {
			return await beginGitlabOAuthFlow({
				...member,
				origin,
				groupPath,
				clientId: env.GITLAB_OAUTH_CLIENT_ID ?? "",
				issuer: env.GITLAB_ISSUER,
				redirectUri: `${env.NEXT_PUBLIC_API_URL}/api/gitlab/callback`,
			});
		} catch {
			return redirect({ error: "path_not_found" });
		}
	}
	let identity: Awaited<ReturnType<typeof identifyToken>>;
	try {
		identity = await identifyToken({ origin, token, groupPath });
	} catch (error) {
		return redirect({ error: connectFailureCode(error) });
	}
	const result = await completeGitlabConnection({
		member,
		origin,
		token,
		auth: "token",
		identity,
	});
	if (!result.connected) return redirect({ error: "already_connected" });
	return redirect({
		connected: "1",
		error: result.hookFailed ? "hook_failed" : undefined,
	});
}
