import { describe, expect, test } from "bun:test";
import {
	decodeMessagesCursor,
	encodeMessagesCursor,
	getMessagesInput,
	listSessionsInput,
	promptInput,
	respondToPermissionInput,
} from "./api";

describe("messages cursor", () => {
	test("round-trips positive seqs", () => {
		for (const seq of [1, 42, 5000, 987654321]) {
			expect(decodeMessagesCursor(encodeMessagesCursor(seq))).toBe(seq);
		}
	});

	test("encode rejects non-positive and non-integer seqs", () => {
		expect(() => encodeMessagesCursor(0)).toThrow();
		expect(() => encodeMessagesCursor(-3)).toThrow();
		expect(() => encodeMessagesCursor(1.5)).toThrow();
	});

	test("decode returns null on malformed cursors", () => {
		for (const bad of ["", "s0", "s-1", "s1.5", "42", "sabc", "s01"]) {
			expect(decodeMessagesCursor(bad)).toBeNull();
		}
	});
});

describe("router input schemas", () => {
	test("promptInput requires at least one structurally valid content block", () => {
		expect(
			promptInput.safeParse({
				sessionId: "s1",
				prompt: [{ type: "text", text: "hi" }],
			}).success,
		).toBe(true);
		expect(promptInput.safeParse({ sessionId: "s1", prompt: [] }).success).toBe(
			false,
		);
		expect(
			promptInput.safeParse({ sessionId: "s1", prompt: [{ text: "no type" }] })
				.success,
		).toBe(false);
	});

	test("respondToPermissionInput accepts both outcome shapes and rejects junk", () => {
		const base = { sessionId: "s1", requestId: "r1" };
		expect(
			respondToPermissionInput.safeParse({
				...base,
				outcome: { outcome: "cancelled" },
			}).success,
		).toBe(true);
		expect(
			respondToPermissionInput.safeParse({
				...base,
				outcome: { outcome: "selected", optionId: "allow" },
			}).success,
		).toBe(true);
		expect(
			respondToPermissionInput.safeParse({
				...base,
				outcome: { outcome: "selected" },
			}).success,
		).toBe(false);
	});

	test("getMessagesInput defaults limit and bounds it", () => {
		const parsed = getMessagesInput.parse({ sessionId: "s1" });
		expect(parsed.limit).toBe(50);
		expect(
			getMessagesInput.safeParse({ sessionId: "s1", limit: 500 }).success,
		).toBe(false);
	});

	test("listSessionsInput rejects malformed and unsafe numeric cursors", () => {
		expect(
			listSessionsInput.safeParse({ cursor: "1700000000000:session-1" })
				.success,
		).toBe(true);
		for (const cursor of [
			"not-a-cursor",
			"1700000000000:",
			"999999999999999999999999:session-1",
		]) {
			expect(listSessionsInput.safeParse({ cursor }).success).toBe(false);
		}
	});
});
