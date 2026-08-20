const DEFAULT_MAX_BYTES = 1024 * 1024;

/**
 * Reads the raw body with a size cap enforced while streaming, so an
 * oversized body is refused without ever being held in memory. The
 * Content-Length pre-check just refuses honest senders cheaply.
 */
export async function cappedBody(
	request: Request,
	maxBytes = DEFAULT_MAX_BYTES,
): Promise<string | Response> {
	const tooLarge = () =>
		Response.json({ error: "Body too large" }, { status: 413 });
	if (Number(request.headers.get("content-length")) > maxBytes) {
		return tooLarge();
	}
	if (!request.body) return "";
	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let received = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		received += value.byteLength;
		if (received > maxBytes) {
			await reader.cancel();
			return tooLarge();
		}
		chunks.push(value);
	}
	return Buffer.concat(chunks).toString("utf8");
}

/** JSON.parse that answers 400 instead of throwing. */
export function parseJson<T>(body: string): T | Response {
	try {
		return JSON.parse(body) as T;
	} catch {
		return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
	}
}
