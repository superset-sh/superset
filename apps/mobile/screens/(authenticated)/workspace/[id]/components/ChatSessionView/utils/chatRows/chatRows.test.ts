import { describe, expect, test } from "bun:test";
import type { OutboxEntry, TurnGroup } from "@superset/chat/core";
import { chatRows, runningTurnId } from "./chatRows";

const turn = (id: string, status: "running" | "completed") => ({
	id,
	status,
	startedAtMs: 1,
});

const user = (id: string, clientId: string) => ({
	id,
	kind: "user_message" as const,
	clientId,
	content: [{ type: "text" as const, text: "hi" }],
	startedAtMs: 1,
});

const outbox = (clientId: string): OutboxEntry => ({
	commandId: `c-${clientId}`,
	clientId,
	content: [{ type: "text", text: "hi" }],
	state: "inflight",
	attempts: 1,
	lastError: null,
});

describe("chatRows", () => {
	test("an echoed prompt replaces its outbox bubble under the same key", () => {
		const groups: TurnGroup[] = [
			{
				turn: turn("t1", "completed"),
				turnId: "t1",
				entries: [{ kind: "item", item: user("u1", "client-1") }],
			},
		];
		const rows = chatRows(groups, [outbox("client-1"), outbox("client-2")]);
		expect(rows.map((row) => [row.kind, row.key])).toEqual([
			["item", "client-1"],
			["outbox", "client-2"],
		]);
	});

	test("a running turn with nothing live ends with a working line", () => {
		const groups: TurnGroup[] = [
			{
				turn: turn("t1", "running"),
				turnId: "t1",
				entries: [{ kind: "item", item: user("u1", "client-1") }],
			},
		];
		expect(chatRows(groups, []).at(-1)?.kind).toBe("working");
		expect(runningTurnId(groups)).toBe("t1");
	});
});
