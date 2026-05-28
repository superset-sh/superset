import type { IBase64 } from "@xterm/addon-clipboard";

/**
 * UTF-8-aware base64 codec for xterm's ClipboardAddon (OSC 52 copy/paste).
 *
 * The addon's bundled `Base64` provider uses `btoa`/`atob`, which only speak
 * Latin-1 "binary strings" — one char per byte. For any multi-byte UTF-8
 * character (Japanese/CJK, accented Latin, box-drawing/em-dash) that breaks
 * both directions:
 *
 * - decode: `atob` returns a string whose chars ARE the raw UTF-8 bytes
 *   (e.g. あ → "ã"). Handing that to `navigator.clipboard`
 *   re-encodes each char as UTF-8, so `0xe3` (ã) becomes `c3 a3`, etc. —
 *   classic double-UTF-8 mojibake (`あいうえお` pastes as `ããããã`).
 * - encode: `btoa` throws on any code point > 0xFF, so reporting the
 *   selection back via OSC 52 silently fails for non-Latin text.
 *
 * Routing through TextEncoder/TextDecoder makes the base64 payload the real
 * UTF-8 byte stream, matching the OSC 52 spec and what macOS Terminal.app and
 * other emulators produce. See GitHub #4839 / #4956.
 */
export class Utf8Base64 implements IBase64 {
	encodeText(data: string): string {
		const bytes = new TextEncoder().encode(data);
		let binary = "";
		for (const byte of bytes) {
			binary += String.fromCharCode(byte);
		}
		return btoa(binary);
	}

	decodeText(data: string): string {
		// `atob` throws on malformed base64; the addon relies on that to bail,
		// so let it propagate rather than swallowing it here.
		const binary = atob(data);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) {
			bytes[i] = binary.charCodeAt(i);
		}
		return new TextDecoder("utf-8").decode(bytes);
	}
}
