// ws rejects close reasons over 123 UTF-8 bytes with a RangeError, which
// (thrown from ws.close) turns an attach failure into a code-less error the
// renderer treats as permanent. Truncation must land on a UTF-8 character
// boundary: a split multibyte char decodes to U+FFFD, which re-expands to 3
// bytes when ws re-encodes the string and can push it back over the cap.

const MAX_WS_CLOSE_REASON_BYTES = 123;
const ELLIPSIS = "...";

export function toWsCloseReason(message: string): string {
	if (Buffer.byteLength(message) <= MAX_WS_CLOSE_REASON_BYTES) return message;
	const bytes = Buffer.from(message);
	let cut = MAX_WS_CLOSE_REASON_BYTES - ELLIPSIS.length;
	// Back off UTF-8 continuation bytes (0b10xxxxxx) to a character start.
	while (cut > 0 && ((bytes[cut] ?? 0) & 0xc0) === 0x80) cut--;
	let out = `${bytes.subarray(0, cut).toString()}${ELLIPSIS}`;
	// Hard guarantee after decode, whatever the bytes contained.
	while (
		Buffer.byteLength(out) > MAX_WS_CLOSE_REASON_BYTES &&
		out.length > ELLIPSIS.length
	) {
		out = `${out.slice(0, out.length - ELLIPSIS.length - 1)}${ELLIPSIS}`;
	}
	return out;
}
