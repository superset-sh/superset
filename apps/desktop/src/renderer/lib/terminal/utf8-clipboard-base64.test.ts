import { describe, expect, it } from "bun:test";
import { Utf8ClipboardBase64 } from "./utf8-clipboard-base64";

/**
 * Reproduces #4956 / #4839: the default `@xterm/addon-clipboard` Base64
 * codec uses `btoa`/`atob` raw, so OSC 52 clipboard payloads come out
 * double-UTF-8 encoded (e.g. `の` E3 81 AE → "Ã^A®" → C3 A3 C2 81 C2 AE).
 *
 * `Utf8ClipboardBase64` interposes TextEncoder/TextDecoder so any UTF-8
 * input round-trips intact.
 */
describe("Utf8ClipboardBase64", () => {
	const codec = new Utf8ClipboardBase64();

	function bytesOf(text: string): number[] {
		return Array.from(new TextEncoder().encode(text));
	}

	it("round-trips ASCII", () => {
		const input = "hello world";
		expect(codec.decodeText(codec.encodeText(input))).toBe(input);
	});

	it("round-trips Latin accents (the SautÃ©ed → Sautéed case)", () => {
		const input = "Sautéed";
		expect(bytesOf(input)).toEqual([
			0x53, 0x61, 0x75, 0x74, 0xc3, 0xa9, 0x65, 0x64,
		]);
		expect(codec.decodeText(codec.encodeText(input))).toBe(input);
	});

	it("round-trips CJK (the issue #4839 case: の)", () => {
		const input = "の";
		expect(bytesOf(input)).toEqual([0xe3, 0x81, 0xae]);
		expect(codec.decodeText(codec.encodeText(input))).toBe(input);
	});

	it("round-trips em-dash and box-drawing dividers", () => {
		const emDash = "—";
		expect(bytesOf(emDash)).toEqual([0xe2, 0x80, 0x94]);
		expect(codec.decodeText(codec.encodeText(emDash))).toBe(emDash);

		const horizontal = "─".repeat(40);
		expect(codec.decodeText(codec.encodeText(horizontal))).toBe(horizontal);
	});

	it("round-trips emoji (4-byte UTF-8 / surrogate pair)", () => {
		const input = "🎉";
		expect(bytesOf(input)).toEqual([0xf0, 0x9f, 0x8e, 0x89]);
		expect(codec.decodeText(codec.encodeText(input))).toBe(input);
	});

	it("decodes payloads produced by a UTF-8-aware encoder elsewhere", () => {
		// What a terminal app (e.g. Claude Code) sends via OSC 52:
		// base64 of the UTF-8 bytes of the text.
		const text = "Sautéed";
		const base64Payload = Buffer.from(text, "utf8").toString("base64");
		expect(codec.decodeText(base64Payload)).toBe(text);
	});

	it("does NOT produce the double-UTF-8 corruption that the default Base64 yields", () => {
		// The xterm addon's default `Base64` is effectively `{ decodeText: atob }`.
		// For UTF-8 bytes of `é` (C3 A9), atob produces a 2-char string with
		// code points U+00C3 U+00A9, which navigator.clipboard.writeText would
		// then re-encode as 4 bytes C3 83 C2 A9 — the bug.
		const utf8OfAccent = Buffer.from("é", "utf8").toString("base64");

		const defaultDecode = atob(utf8OfAccent);
		expect(defaultDecode).toBe("Ã©");
		expect(bytesOf(defaultDecode)).toEqual([0xc3, 0x83, 0xc2, 0xa9]);

		// Our codec returns the original character, not the Latin-1
		// reinterpretation of its UTF-8 bytes.
		expect(codec.decodeText(utf8OfAccent)).toBe("é");
		expect(bytesOf(codec.decodeText(utf8OfAccent))).toEqual([0xc3, 0xa9]);
	});

	it("returns empty string for malformed base64 instead of throwing", () => {
		expect(codec.decodeText("!!!not-base64!!!")).toBe("");
	});
});
