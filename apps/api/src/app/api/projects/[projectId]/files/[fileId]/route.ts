import { auth } from "@superset/auth/server";
import { signedDocumentFileUrl } from "@superset/trpc/lib/document-files";

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ projectId: string; fileId: string }> },
): Promise<Response> {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user) return new Response("Unauthorized", { status: 401 });
	const { projectId, fileId } = await params;
	const url = await signedDocumentFileUrl({
		userId: session.user.id,
		scope: { kind: "projects", id: projectId },
		fileId,
	});
	if (!url) return new Response("Not found", { status: 404 });
	return Response.redirect(url, 302);
}
