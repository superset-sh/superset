import { refreshSandboxCredentials } from "@superset/trpc/lib/sandbox";

/**
 * A running sandbox asking for its credential rules to be re-applied before
 * the GitHub token in them expires. Authenticated by the box's host secret.
 */
export async function POST(
	request: Request,
	{ params }: { params: Promise<{ workspaceId: string }> },
): Promise<Response> {
	const { workspaceId } = await params;
	const presented = request.headers
		.get("authorization")
		?.replace(/^Bearer\s+/i, "");
	if (!presented || !/^[0-9a-f-]{36}$/i.test(workspaceId)) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}
	const outcome = await refreshSandboxCredentials({
		workspaceId,
		presentedSecret: presented,
	});
	if (outcome === "unauthorized") {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}
	return Response.json({ outcome });
}
