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

	const body = (await request.json()) as {
		toolCallId: string;
		output: unknown;
		error?: string | null;
		messageId?: string;
	};

	if (!body.toolCallId) {
		return Response.json({ error: "toolCallId is required" }, { status: 400 });
	}

	const messageId = body.messageId ?? crypto.randomUUID();

	const event = sessionStateSchema.chunks.insert({
		key: `${messageId}:0`,
		value: {
			messageId,
			actorId,
			role: "user",
			chunk: JSON.stringify({
				type: "tool-result",
				toolCallId: body.toolCallId,
				output: body.output,
				error: body.error ?? null,
			}),
			seq: 0,
			createdAt: new Date().toISOString(),
		},
	});

	await appendToStream(sessionId, JSON.stringify(event));

	return Response.json({ messageId }, { status: 200 });
}
