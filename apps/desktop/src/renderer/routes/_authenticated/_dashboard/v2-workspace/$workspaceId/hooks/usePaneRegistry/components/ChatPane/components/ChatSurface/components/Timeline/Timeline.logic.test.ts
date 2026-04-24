import { describe, expect, it } from "bun:test";
import type {
	AssistantMessage,
	Part,
	SessionStatus,
	Turn,
	UserMessage,
} from "@superset/chat/shared";
import { deriveTimelineRows } from "./Timeline.logic";

const userMsg = (id: string): UserMessage => ({
	id,
	sessionID: "s",
	role: "user",
	time: { created: 1 },
});
const asstMsg = (
	id: string,
	parentID: string,
	completed?: number,
): AssistantMessage => ({
	id,
	sessionID: "s",
	role: "assistant",
	parentID,
	modelID: "m",
	providerID: "p",
	time: { created: 2, ...(completed !== undefined ? { completed } : {}) },
});
const textPart = (id: string, messageID: string): Part => ({
	id,
	messageID,
	sessionID: "s",
	type: "text",
	text: "hi",
	time: { start: 0 },
});
const toolPart = (id: string, messageID: string): Part => ({
	id,
	messageID,
	sessionID: "s",
	type: "tool",
	tool: "shell",
	state: { kind: "running", input: {} },
	time: { start: 0 },
});

const idle: SessionStatus = { type: "idle" };
const busy: SessionStatus = { type: "busy" };

function turn({
	user,
	assistant = [],
	parts = {},
	active = false,
}: {
	user: UserMessage;
	assistant?: AssistantMessage[];
	parts?: Record<string, Part[]>;
	active?: boolean;
}): Turn {
	return { user, assistant, parts, active };
}

describe("deriveTimelineRows", () => {
	it("returns an empty row when there are no turns and no history", () => {
		const rows = deriveTimelineRows({ turns: [], status: idle });
		expect(rows).toEqual([{ kind: "empty" }]);
	});

	it("prepends a load-earlier row when historyMore", () => {
		const rows = deriveTimelineRows({
			turns: [],
			status: idle,
			historyMore: true,
		});
		expect(rows[0]).toEqual({ kind: "load-earlier", loading: false });
	});

	it("emits user + assistant rows per turn in order", () => {
		const u1 = userMsg("u1");
		const a1 = asstMsg("a1", "u1", 3);
		const rows = deriveTimelineRows({
			turns: [turn({ user: u1, assistant: [a1], parts: { u1: [], a1: [] } })],
			status: idle,
		});
		expect(rows.map((r) => r.kind)).toEqual([
			"turn-user",
			"turn-assistant",
		]);
	});

	it("marks the last assistant of the active turn as streaming when not completed", () => {
		const u1 = userMsg("u1");
		const a1 = asstMsg("a1", "u1"); // no completed
		const rows = deriveTimelineRows({
			turns: [
				turn({
					user: u1,
					assistant: [a1],
					parts: { a1: [textPart("p", "a1")] },
					active: true,
				}),
			],
			status: busy,
		});
		const last = rows.find((r) => r.kind === "turn-assistant");
		if (!last || last.kind !== "turn-assistant") {
			throw new Error("expected assistant row");
		}
		expect(last.streaming).toBe(true);
	});

	it("emits a thinking row on the active turn when no visible content exists yet", () => {
		const u1 = userMsg("u1");
		const rows = deriveTimelineRows({
			turns: [turn({ user: u1, active: true })],
			status: busy,
		});
		expect(rows.at(-1)).toEqual({ kind: "thinking", turnIndex: 0 });
	});

	it("does NOT emit thinking when the active assistant already has text", () => {
		const u1 = userMsg("u1");
		const a1 = asstMsg("a1", "u1");
		const rows = deriveTimelineRows({
			turns: [
				turn({
					user: u1,
					assistant: [a1],
					parts: { a1: [textPart("p", "a1")] },
					active: true,
				}),
			],
			status: busy,
		});
		expect(rows.some((r) => r.kind === "thinking")).toBe(false);
	});

	it("does NOT mark streaming on inactive turns even if busy", () => {
		const u1 = userMsg("u1");
		const a1 = asstMsg("a1", "u1");
		const rows = deriveTimelineRows({
			turns: [turn({ user: u1, assistant: [a1], active: false })],
			status: busy,
		});
		const row = rows.find((r) => r.kind === "turn-assistant");
		if (!row || row.kind !== "turn-assistant") throw new Error("expected");
		expect(row.streaming).toBe(false);
	});

	it("tool-only assistant content still triggers the thinking indicator until text arrives", () => {
		const u1 = userMsg("u1");
		const a1 = asstMsg("a1", "u1");
		const rows = deriveTimelineRows({
			turns: [
				turn({
					user: u1,
					assistant: [a1],
					parts: { a1: [toolPart("tp", "a1")] },
					active: true,
				}),
			],
			status: busy,
		});
		expect(rows.some((r) => r.kind === "thinking")).toBe(true);
	});
});
