import { describe, expect, it } from "bun:test";
import type { Message, Part } from "@superset/chat/shared";
import { findChatMatches } from "./ChatSearch.logic";

const msg = (id: string, role: "user" | "assistant"): Message =>
	role === "user"
		? { id, sessionID: "s", role, time: { created: 0 } }
		: {
				id,
				sessionID: "s",
				role,
				parentID: "u",
				modelID: "m",
				providerID: "p",
				time: { created: 0 },
			};
const textPart = (id: string, messageID: string, text: string): Part => ({
	id,
	messageID,
	sessionID: "s",
	type: "text",
	text,
	time: { start: 0 },
});
const syntheticPart = (
	id: string,
	messageID: string,
	text: string,
): Part => ({
	id,
	messageID,
	sessionID: "s",
	type: "text",
	text,
	synthetic: true,
	time: { start: 0 },
});

describe("findChatMatches", () => {
	it("returns empty for empty query", () => {
		expect(
			findChatMatches(
				{
					messages: [msg("u1", "user")],
					parts: { u1: [textPart("p", "u1", "hello")] },
				},
				"",
			),
		).toEqual([]);
	});

	it("finds all occurrences across messages (case-insensitive by default)", () => {
		const matches = findChatMatches(
			{
				messages: [msg("u1", "user"), msg("a1", "assistant")],
				parts: {
					u1: [textPart("p1", "u1", "Hello, world. hello world.")],
					a1: [textPart("p2", "a1", "HELLO back")],
				},
			},
			"hello",
		);
		expect(matches).toHaveLength(3);
		expect(matches[0]?.messageID).toBe("u1");
		expect(matches[0]?.offset).toBe(0);
		expect(matches[1]?.offset).toBe(14);
		expect(matches[2]?.messageID).toBe("a1");
	});

	it("respects case-sensitive flag", () => {
		const matches = findChatMatches(
			{
				messages: [msg("u1", "user")],
				parts: { u1: [textPart("p1", "u1", "Hello hello")] },
			},
			"hello",
			{ caseSensitive: true },
		);
		expect(matches).toHaveLength(1);
		expect(matches[0]?.offset).toBe(6);
	});

	it("skips synthetic text parts and non-text parts", () => {
		const matches = findChatMatches(
			{
				messages: [msg("u1", "user")],
				parts: {
					u1: [
						syntheticPart("s1", "u1", "hidden hello"),
						textPart("p1", "u1", "hello visible"),
					],
				},
			},
			"hello",
		);
		expect(matches).toHaveLength(1);
		expect(matches[0]?.partID).toBe("p1");
	});
});
