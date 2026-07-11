import { describe, expect, test } from "bun:test";
import type { SessionMessage } from "@superset/session-protocol";
import {
	loadSessionHistory,
	loadWorkspaceClaudeSessions,
} from "./session-pages";

function transcriptMessage(uuid: string): SessionMessage {
	return {
		type: "user",
		uuid,
		session_id: "session-1",
		message: { role: "user", content: uuid },
		parent_tool_use_id: null,
		parent_agent_id: null,
	};
}

describe("Claude session pages", () => {
	test("walks history cursors and restores chronological order", async () => {
		const calls: Array<string | undefined> = [];
		const getMessages = async (input: {
			sessionId: string;
			cursor?: string;
			limit?: number;
		}) => {
			calls.push(input.cursor);
			return input.cursor
				? { items: [transcriptMessage("old")], nextCursor: null }
				: { items: [transcriptMessage("new")], nextCursor: "opaque" };
		};

		const messages = await loadSessionHistory({ getMessages }, "session-1");
		expect(messages.map((message) => message.uuid)).toEqual(["old", "new"]);
		expect(calls).toEqual([undefined, "opaque"]);
	});

	test("rejects a repeated history cursor", async () => {
		const getMessages = async () => ({
			items: [transcriptMessage("message")],
			nextCursor: "repeated",
		});

		await expect(
			loadSessionHistory({ getMessages }, "session-1"),
		).rejects.toThrow("Session history returned a repeated cursor");
	});

	test("walks every session-directory cursor", async () => {
		const first = { sessionId: "new", workspaceId: "workspace-1" } as never;
		const second = { sessionId: "old", workspaceId: "workspace-1" } as never;
		const list = async (input?: { cursor?: string }) =>
			input?.cursor
				? { items: [first, second], nextCursor: null }
				: { items: [first], nextCursor: "older" };

		const sessions = await loadWorkspaceClaudeSessions({ list }, "workspace-1");
		expect(sessions.map((session) => session.sessionId)).toEqual([
			"new",
			"old",
		]);
	});
});
