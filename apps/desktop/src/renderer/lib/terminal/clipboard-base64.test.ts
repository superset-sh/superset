import { describe, expect, it } from "bun:test";
import { Utf8Base64 } from "./clipboard-base64";

const codec = new Utf8Base64();

// The exact bytes a shell emits for these characters, base64-encoded. These are
// what an OSC 52 copy payload actually contains; decodeText must turn them back
// into the original characters rather than Latin-1 byte-chars.
const cases: Array<{ name: string; text: string; base64: string }> = [
	{ name: "ascii", text: "hello", base64: "aGVsbG8=" },
	// の = U+306E = E3 81 AE
	{ name: "single hiragana の", text: "の", base64: "44Gu" },
	// あいうえお = E3 81 82 / E3 81 84 / E3 81 86 / E3 81 88 / E3 81 8A
	{
		name: "hiragana run あいうえお",
		text: "あいうえお",
		base64: "44GC44GE44GG44GI44GK",
	},
	// accented Latin: Sautéed (é = U+00E9 = C3 A9)
	{ name: "accented latin", text: "Sautéed", base64: "U2F1dMOpZWQ=" },
	// box-drawing horizontal line U+2500 = E2 94 80
	{ name: "box drawing ─", text: "─", base64: "4pSA" },
	// emoji outside the BMP (surrogate pair): 😀 = F0 9F 98 80
	{ name: "emoji 😀", text: "😀", base64: "8J+YgA==" },
];

describe("Utf8Base64", () => {
	it("decodes UTF-8 OSC 52 payloads back to the original text", () => {
		for (const { name, text, base64 } of cases) {
			expect(codec.decodeText(base64), name).toBe(text);
		}
	});

	it("encodes text to the real UTF-8 byte base64", () => {
		for (const { name, text, base64 } of cases) {
			expect(codec.encodeText(text), name).toBe(base64);
		}
	});

	it("round-trips arbitrary multibyte text", () => {
		const samples = [
			"の",
			"あいうえお",
			"Sautéed",
			"─━│",
			"😀🎉",
			"mixed ABC 日本語 123",
		];
		for (const sample of samples) {
			expect(codec.decodeText(codec.encodeText(sample))).toBe(sample);
		}
	});

	it("throws so the addon can bail on malformed base64 or non-UTF-8 bytes", () => {
		expect(() => codec.decodeText("@@@not base64@@@")).toThrow();
		// "/w==" is valid base64 for a lone 0xFF, which is not valid UTF-8.
		expect(() => codec.decodeText("/w==")).toThrow();
	});
});
