import { env } from "@/env";
import { requireOrgMember } from "@/lib/integrations/requireOrgMember";
import { disconnectGitlabConnection } from "../lifecycle";
import { gitlabMutationRequest } from "../mutation-origin";
import { redirectGitLab } from "../redirect";

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
	const result = await disconnectGitlabConnection(member);
	return redirectGitLab(
		{
			disconnected: result.disconnected ? "1" : undefined,
			error: result.cleanupFailed ? "disconnect_failed" : undefined,
		},
		member,
	);
}
