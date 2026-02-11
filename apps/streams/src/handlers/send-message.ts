import type { Context } from "hono";
import type { AIDBSessionProtocol } from "../protocol";
import {
	type SendMessageRequest,
	type SendMessageResponse,
	sendMessageRequestSchema,
} from "../types";

export async function handleSendMessage(
	c: Context,
	protocol: AIDBSessionProtocol,
): Promise<Response> {
	const sessionId = c.req.param("sessionId");

	let body: SendMessageRequest;
	try {
		const rawBody = await c.req.json();
		body = sendMessageRequestSchema.parse(rawBody);
	} catch (error) {
		return c.json(
			{ error: "Invalid request body", details: (error as Error).message },
			400,
		);
	}

	const actorId =
		body.actorId ?? c.req.header("X-Actor-Id") ?? crypto.randomUUID();

	const messageId = body.messageId ?? crypto.randomUUID();

	try {
		const stream = await protocol.getOrCreateSession(sessionId);

		await protocol.writeUserMessage(
			stream,
			sessionId,
			messageId,
			actorId,
			body.content,
			body.txid,
		);

		const response: SendMessageResponse = { messageId };
		return c.json(response, 200);
	} catch (error) {
		console.error("Failed to send message:", error);
		return c.json(
			{ error: "Failed to send message", details: (error as Error).message },
			500,
		);
	}
}
