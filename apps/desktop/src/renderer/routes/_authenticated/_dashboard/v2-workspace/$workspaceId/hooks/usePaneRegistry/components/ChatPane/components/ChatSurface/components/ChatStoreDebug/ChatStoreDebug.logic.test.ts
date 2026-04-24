import { describe, expect, it } from "bun:test";
import type { Message, Part } from "@superset/chat/shared";
import {
	deriveParitySummary,
	isInParity,
	type LegacyLikeMessage,
} from "./ChatStoreDebug.logic";

const userMsg = (id: string): Message => ({
	id,
	sessionID: "s",
	role: "user",
	time: { created: 1 },
});

const asstMsg = (id: string, parentID: string): Message => ({
	id,
	sessionID: "s",
	role: "assistant",
	parentID,
	modelID: "m",
	providerID: "p",
	time: { created: 2 },
});

const textPart = (id: string, messageID: string): Part => ({
	id,
	messageID,
	sessionID: "s",
	type: "text",
	text: "x",
	time: { start: 0 },
});

describe("deriveParitySummary", () => {
	it("returns zeros on empty inputs", () => {
		const summary = deriveParitySummary({ slice: null, legacy: null });
		expect(summary.newMessages).toBe(0);
		expect(summary.legacyMessages).toBe(0);
		expect(isInParity(summary)).toBe(true);
	});

	it("flags messages present in legacy but missing from the new store", () => {
		const legacy: LegacyLikeMessage[] = [
			{ id: "u1", role: "user", content: [{ type: "text" }] },
			{ id: "a1", role: "assistant", content: [{ type: "text" }] },
		];
		const slice = {
			messages: [userMsg("u1")],
			parts: { u1: [textPart("p1", "u1")] },
		};
		const summary = deriveParitySummary({ slice, legacy });
		expect(summary.missingInNew).toEqual(["a1"]);
		expect(summary.extraInNew).toEqual([]);
		expect(isInParity(summary)).toBe(false);
	});

	it("counts user/assistant splits and parts/content totals", () => {
		const legacy: LegacyLikeMessage[] = [
			{
				id: "u1",
				role: "user",
				content: [{ type: "text" }, { type: "image" }],
			},
			{
				id: "a1",
				role: "assistant",
				content: [{ type: "tool_call" }, { type: "tool_result" }, { type: "text" }],
			},
		];
		const slice = {
			messages: [userMsg("u1"), asstMsg("a1", "u1")],
			parts: {
				u1: [textPart("u1-p0", "u1"), textPart("u1-p1", "u1")],
				a1: [textPart("a1-p0", "a1"), textPart("a1-p1", "a1")],
			},
		};
		const summary = deriveParitySummary({ slice, legacy });
		expect(summary.newUser).toBe(1);
		expect(summary.newAssistant).toBe(1);
		expect(summary.legacyUser).toBe(1);
		expect(summary.legacyAssistant).toBe(1);
		expect(summary.newParts).toBe(4);
		expect(summary.legacyContent).toBe(5); // tool_call + tool_result pair reduces to 1 part but legacy counts both
		expect(isInParity(summary)).toBe(true);
	});
});
