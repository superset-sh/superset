import { describe, expect, test } from "bun:test";
import { toWsCloseReason } from "./ws-close-reason";

const byteLen = (s: string) => Buffer.byteLength(s);

describe("toWsCloseReason", () => {
	test("short and exactly-123-byte reasons pass through untouched", () => {
		expect(toWsCloseReason("short")).toBe("short");
		const exact = "a".repeat(123);
		expect(toWsCloseReason(exact)).toBe(exact);
	});

	test("long ASCII reasons truncate to <=123 bytes with ellipsis", () => {
		const out = toWsCloseReason("a".repeat(200));
		expect(byteLen(out)).toBeLessThanOrEqual(123);
		expect(out.endsWith("...")).toBe(true);
	});

	test("cut landing mid-2-byte-char backs off to the boundary (the naive byte-slice regression: U+FFFD re-expanded past 123 bytes)", () => {
		// 2 ASCII + 61x "é" (2 bytes each) = 124 bytes. A naive byte cut at 119
		// splits an "é", decodes to U+FFFD (3 bytes re-encoded), and lands at
		// 124 bytes total — over ws's cap, so ws.close() threw.
		const input = `aa${"é".repeat(61)}`;
		expect(byteLen(input)).toBe(124);
		const out = toWsCloseReason(input);
		expect(byteLen(out)).toBeLessThanOrEqual(123);
		expect(out.includes("�")).toBe(false);
		expect(out.endsWith("...")).toBe(true);
	});

	test("cut landing mid-4-byte-char backs off to the boundary", () => {
		// 119 ASCII + 4-byte emoji: byte 120 is inside the emoji.
		const input = `${"a".repeat(119)}🙂🙂`;
		const out = toWsCloseReason(input);
		expect(byteLen(out)).toBeLessThanOrEqual(123);
		expect(out.includes("�")).toBe(false);
	});

	test("all-multibyte reasons stay under the cap", () => {
		const out = toWsCloseReason("🙂".repeat(64));
		expect(byteLen(out)).toBeLessThanOrEqual(123);
		expect(out.includes("�")).toBe(false);
	});
});
