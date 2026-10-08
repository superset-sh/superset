import { reportSandboxPullRequests } from "@superset/trpc/lib/sandbox";
import { z } from "zod";

const bodySchema = z.object({
	pullRequests: z
		.array(
			z.object({
				repository: z.string().regex(/^[^/\s]+\/[^/\s]+$/),
				number: z.number().int().positive().max(2_147_483_647),
				linkedAt: z.number().int().positive().optional(),
			}),
		)
		.max(200),
});

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
	const parsed = bodySchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		return Response.json({ error: "invalid body" }, { status: 400 });
	}
	const result = await reportSandboxPullRequests({
		workspaceId,
		presentedSecret: presented,
		pullRequests: parsed.data.pullRequests,
	});
	if (result === "unauthorized") {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}
	if (result === "unknown") {
		return Response.json({ error: "unknown workspace" }, { status: 404 });
	}
	return Response.json({ ok: true, ignored: result.ignored });
}
