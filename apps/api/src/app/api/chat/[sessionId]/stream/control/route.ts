import { sessionStateSchema } from "@superset/durable-session";
import { appendToStream, requireAuth } from "../../../lib";

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ sessionId: string }> },
): Promise<Response> {
	const session = await requireAuth(request);
	if (!session) return new Response("Unauthorized", { status: 401 });

	const { sessionId } = await params;
	const actorId = session.user.id;

	const body = (await request.json()) as { action: string };

	if (!body.action) {
		return Response.json({ error: "action is required" }, { status: 400 });
	}

	const messageId = crypto.randomUUID();

	const event = sessionStateSchema.chunks.insert({
		key: `${messageId}:0`,
		value: {
			messageId,
			actorId,
			role: "user",
			chunk: JSON.stringify({
				type: "control",
				action: body.action,
			}),
			seq: 0,
			createdAt: new Date().toISOString(),
		},
	});

	await appendToStream(sessionId, JSON.stringify(event));

	return Response.json({ success: true }, { status: 200 });
}
