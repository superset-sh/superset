import { gitlabConnectionForOrg } from "@superset/trpc/lib/gitlab/connection";
import { env } from "@/env";
import { requireOrgMember } from "@/lib/integrations/requireOrgMember";
import { gitlabMutationRequest } from "../mutation-origin";
import { GitlabHookScopeError, reconcileGitlabHooks } from "../reconcile-hooks";
import { redirectGitLab } from "../redirect";

export async function POST(request: Request) {
	const authenticatedRequest = gitlabMutationRequest(request, [
		env.NEXT_PUBLIC_API_URL,
		env.NEXT_PUBLIC_WEB_URL,
	]);
	if (!authenticatedRequest)
		return Response.json({ error: "Invalid request origin" }, { status: 403 });
	const member = await requireOrgMember(authenticatedRequest, {
		requireAdmin: true,
	});
	if (member instanceof Response) return member;
	const form =
		authenticatedRequest.headers
			.get("content-type")
			?.includes("application/x-www-form-urlencoded") ?? false;
	const fail = (error: string, status: number) =>
		form
			? redirectGitLab({ error: "hook_failed" }, member)
			: Response.json({ error }, { status });
	const body: unknown = form
		? await authenticatedRequest
				.formData()
				.then((data) => Object.fromEntries(data.entries()))
				.catch(() => null)
		: await authenticatedRequest.json().catch(() => null);
	if (!body || typeof body !== "object" || Array.isArray(body))
		return fail("Invalid payload", 400);
	const projectId = "projectId" in body ? body.projectId : undefined;
	if (
		projectId !== undefined &&
		(typeof projectId !== "string" ||
			!/^[1-9]\d*$/.test(projectId) ||
			!Number.isSafeInteger(Number(projectId)))
	)
		return fail("Invalid project ID", 400);
	const connection = await gitlabConnectionForOrg(member.organizationId);
	if (!connection) return fail("Connect GitLab first", 400);
	try {
		const result = await reconcileGitlabHooks({
			connectionId: connection.id,
			organizationId: member.organizationId,
			...(typeof projectId === "string" ? { projectId } : {}),
		});
		if (result.status === "disconnected") return fail("Reconnect GitLab", 400);
		return form ? redirectGitLab({}, member) : Response.json({ ok: true });
	} catch (error) {
		if (error instanceof GitlabHookScopeError) return fail(error.message, 403);
		return fail("Could not register the GitLab webhook", 502);
	}
}
