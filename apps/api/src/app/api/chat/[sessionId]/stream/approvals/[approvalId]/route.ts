import { sessionStateSchema } from "@superset/durable-session";
import { appendToStream, requireAuth } from "../../../../lib";

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ sessionId: string; approvalId: string }> },
): Promise<Response> {
	const session = await requireAuth(request);
	if (!session) return new Response("Unauthorized", { status: 401 });

	const { sessionId, approvalId } = await params;
	const actorId = session.user.id;

	const body = (await request.json()) as { approved: boolean };

	if (typeof body.approved !== "boolean") {
		return Response.json({ error: "approved is required" }, { status: 400 });
	}

	const messageId = crypto.randomUUID();

	const event = sessionStateSchema.chunks.insert({
		key: `${messageId}:0`,
		value: {
			messageId,
			actorId,
			role: "user",
			chunk: JSON.stringify({
				type: "approval-response",
				approvalId,
				approved: body.approved,
			}),
			seq: 0,
			createdAt: new Date().toISOString(),
		},
	});

	await appendToStream(sessionId, JSON.stringify(event));

	return Response.json({ messageId }, { status: 200 });
}
