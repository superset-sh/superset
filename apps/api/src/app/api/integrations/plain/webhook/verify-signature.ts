import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Plain signs webhook deliveries with `Plain-Request-Signature`:
 * hex(HMAC-SHA256(raw request body, workspace request-signing secret)).
 * https://www.plain.com/docs/request-signing
 */
export function verifyPlainSignature(
	rawBody: string,
	signature: string,
	secret: string,
): boolean {
	const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
	const received = signature.trim().toLowerCase();
	const expectedBuffer = Buffer.from(expected);
	const receivedBuffer = Buffer.from(received);
	return (
		expectedBuffer.length === receivedBuffer.length &&
		timingSafeEqual(expectedBuffer, receivedBuffer)
	);
}
