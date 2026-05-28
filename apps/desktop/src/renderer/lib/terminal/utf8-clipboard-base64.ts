/**
 * UTF-8-safe Base64 codec for `@xterm/addon-clipboard`.
 *
 * The addon's default `Base64` impl pipes strings straight through
 * `btoa` / `atob`. Those operate on "binary strings" (each char treated as a
 * single byte), so a UTF-8-encoded `é` (0xC3 0xA9) base64-decodes to the
 * two-character string `Ã©` (U+00C3, U+00A9). When that string then hits
 * `navigator.clipboard.writeText`, the system clipboard re-encodes it as
 * UTF-8 — `C3 83 C2 A9` — and the user pastes mojibake (#4839, #4956).
 *
 * Wrapping `btoa`/`atob` with `TextEncoder`/`TextDecoder` makes the round
 * trip preserve the original code points for any UTF-8 input (CJK, Latin
 * accents, em-dash, box-drawing).
 */
export class Utf8ClipboardBase64 {
	encodeText(text: string): string {
		const bytes = new TextEncoder().encode(text);
		let binary = "";
		for (let i = 0; i < bytes.length; i++) {
			binary += String.fromCharCode(bytes[i] as number);
		}
		return btoa(binary);
	}

	decodeText(encoded: string): string {
		try {
			const binary = atob(encoded);
			const bytes = new Uint8Array(binary.length);
			for (let i = 0; i < binary.length; i++) {
				bytes[i] = binary.charCodeAt(i);
			}
			return new TextDecoder("utf-8").decode(bytes);
		} catch {
			return "";
		}
	}
}
