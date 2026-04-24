import { describe, expect, it } from "bun:test";
import type {
	AssistantMessage,
	Message,
	Part,
	UserMessage,
} from "@superset/chat/shared";
import { emptyChatStoreData, type ChatStoreData } from "./chatStore.logic";
import {
	selectActiveTurn,
	selectMessages,
	selectStatus,
	selectTurns,
} from "./selectors";

const SESSION = "s1";

const userMsg = (id: string): UserMessage => ({
	id,
	sessionID: SESSION,
	role: "user",
	time: { created: Number.parseInt(id.replace(/\D/g, ""), 10) || 0 },
});

const asstMsg = (id: string, parentID: string): AssistantMessage => ({
	id,
	sessionID: SESSION,
	role: "assistant",
	parentID,
	modelID: "m",
	providerID: "p",
	time: { created: 0 },
});

const textPart = (id: string, messageID: string): Part => ({
	id,
	messageID,
	sessionID: SESSION,
	type: "text",
	text: "x",
	time: { start: 0 },
});

function makeState(
	messages: Message[],
	parts: Record<string, Part[]> = {},
): ChatStoreData {
	return {
		...emptyChatStoreData(),
		messages: { [SESSION]: messages },
		parts,
	};
}

describe("selectTurns", () => {
	it("returns an empty array for a session with no messages", () => {
		const state = emptyChatStoreData();
		expect(selectTurns(state, SESSION)).toEqual([]);
	});

	it("groups assistants to their parent user turn", () => {
		const u1 = userMsg("u1");
		const a1 = asstMsg("a1", "u1");
		const a2 = asstMsg("a2", "u1");
		const u2 = userMsg("u2");
		const state = makeState([u1, a1, a2, u2]);

		const turns = selectTurns(state, SESSION);
		expect(turns).toHaveLength(2);
		expect(turns[0]?.user.id).toBe("u1");
		expect(turns[0]?.assistant.map((a) => a.id)).toEqual(["a1", "a2"]);
		expect(turns[1]?.user.id).toBe("u2");
		expect(turns[1]?.assistant).toEqual([]);
	});

	it("attaches parts for user and assistant messages in the turn", () => {
		const u1 = userMsg("u1");
		const a1 = asstMsg("a1", "u1");
		const parts = {
			u1: [textPart("u1-p0", "u1")],
			a1: [textPart("a1-p0", "a1")],
		};
		const state = makeState([u1, a1], parts);
		const turn = selectTurns(state, SESSION)[0];
		expect(Object.keys(turn?.parts ?? {})).toEqual(["u1", "a1"]);
	});

	it("flags the turn whose user matches activeMessageID", () => {
		const u1 = userMsg("u1");
		const u2 = userMsg("u2");
		const state = makeState([u1, u2]);
		const turns = selectTurns(state, SESSION, "u2");
		expect(turns[0]?.active).toBe(false);
		expect(turns[1]?.active).toBe(true);
	});

	it("returns the same reference when inputs have not changed (memoization)", () => {
		const state = makeState([userMsg("u1")]);
		const first = selectTurns(state, SESSION);
		const second = selectTurns(state, SESSION);
		expect(second).toBe(first);
	});

	it("returns a fresh reference when activeMessageID changes", () => {
		const state = makeState([userMsg("u1")]);
		const first = selectTurns(state, SESSION);
		const second = selectTurns(state, SESSION, "u1");
		expect(second).not.toBe(first);
	});
});

describe("selectActiveTurn", () => {
	it("returns undefined when the session has no turns", () => {
		expect(
			selectActiveTurn(emptyChatStoreData(), SESSION, undefined),
		).toBeUndefined();
	});

	it("returns the matching turn when activeMessageID is set", () => {
		const state = makeState([userMsg("u1"), userMsg("u2")]);
		expect(selectActiveTurn(state, SESSION, "u2")?.user.id).toBe("u2");
	});

	it("returns the last turn when session is busy and no active id is set", () => {
		const state: ChatStoreData = {
			...makeState([userMsg("u1"), userMsg("u2")]),
			status: { [SESSION]: { type: "busy" } },
		};
		expect(selectActiveTurn(state, SESSION, undefined)?.user.id).toBe("u2");
	});

	it("returns undefined when session is idle and no id is set", () => {
		const state = makeState([userMsg("u1")]);
		expect(selectActiveTurn(state, SESSION, undefined)).toBeUndefined();
	});
});

describe("selectMessages / selectStatus fallback", () => {
	it("falls back to empty array / idle for unknown sessions", () => {
		const state = emptyChatStoreData();
		expect(selectMessages(state, "nope")).toEqual([]);
		expect(selectStatus(state, "nope")).toEqual({ type: "idle" });
	});
});
