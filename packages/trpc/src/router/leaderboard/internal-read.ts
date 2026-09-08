import { timingSafeEqual } from "node:crypto";
import { INTERNAL_READ_HEADER } from "./schema";

/**
 * True only when a token is configured and the request presents exactly it.
 * Both sides absent is not a match: an environment without the token must
 * keep rate-limiting every read.
 */
export function isInternalRead(
	headers: Headers,
	token: string | undefined,
): boolean {
	if (!token) return false;
	const presented = headers.get(INTERNAL_READ_HEADER);
	if (!presented) return false;
	const expected = Buffer.from(token);
	const actual = Buffer.from(presented);
	return expected.length === actual.length && timingSafeEqual(expected, actual);
}
