import type { IBase64 } from "@xterm/addon-clipboard";

/**
 * UTF-8-aware base64 codec for xterm's ClipboardAddon (OSC 52 copy/paste).
 *
 * The addon's bundled codec uses `btoa`/`atob`, which treat the payload as
 * Latin-1 (one char per byte). Multi-byte characters (CJK, accented Latin,
 * box-drawing) then get double-UTF-8-encoded on copy and pasted back as
 * mojibake, and non-Latin selections throw on read. Routing through
 * TextEncoder/TextDecoder treats the payload as the real UTF-8 byte stream,
 * matching the OSC 52 spec and native terminals (alacritty, kitty).
 * See GitHub #4839 / #4956.
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
		// `atob` throws on malformed base64; the addon relies on that to bail.
		const binary = atob(data);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) {
			bytes[i] = binary.charCodeAt(i);
		}
		return new TextDecoder("utf-8").decode(bytes);
	}
}
