import { describe, expect, test } from "bun:test";
import { listLiveChats } from "./listLiveChats";

function row(sessionId: string, status: string, live?: boolean) {
	return {
		sessionId,
		scopeId: "workspace-1",
		harness: "claude-acp",
		harnessSessionId: null,
		epoch: "e1",
		status,
		title: null,
		queuedCount: 0,
		updatedAt: 1,
		...(live === undefined ? {} : { live }),
	};
}

describe("listLiveChats", () => {
	test("keeps only the sessions the host reports live", async () => {
		const chats = await listLiveChats({
			listSessions: async () => [
				row("a", "idle", true),
				row("b", "idle", false),
			],
			getSession: async () => {
				throw new Error("not asked when the host reports live");
			},
		});
		expect(chats.map((chat) => chat.sessionId)).toEqual(["a"]);
	});

	test("asks an older host per session, skipping dead ones", async () => {
		const asked: string[] = [];
		const chats = await listLiveChats({
			listSessions: async () =>
				[row("a", "idle"), row("b", "dead"), row("c", "running")] as never,
			getSession: async ({ sessionId }) => {
				asked.push(sessionId);
				return { live: sessionId === "c", session: null, cursor: null };
			},
		});
		expect(asked).toEqual(["a", "c"]);
		expect(chats.map((chat) => chat.sessionId)).toEqual(["c"]);
	});
});
