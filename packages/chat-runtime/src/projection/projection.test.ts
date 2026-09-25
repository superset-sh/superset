import { beforeEach, describe, expect, test } from "bun:test";
import type { ChatRuntime } from "../index";
import { sessionState } from "../testing/fixtures";
import { createTestRuntime } from "../testing/testRuntime";

describe("ChatSessionStore", () => {
	let runtime: ChatRuntime;

	beforeEach(() => {
		runtime = createTestRuntime();
		runtime.journal.open({
			sessionId: "s1",
			scopeId: "w1",
			harness: "claude-code",
		});
		runtime.journal.open({
			sessionId: "s2",
			scopeId: "w2",
			harness: "codex",
		});
	});

	test("lists sessions and filters by workspace", () => {
		expect(
			runtime.sessions
				.list()
				.map((row) => row.sessionId)
				.sort(),
		).toEqual(["s1", "s2"]);
		expect(
			runtime.sessions.listByScope("w2").map((row) => row.harness),
		).toEqual(["codex"]);
	});

	test("keeps the harness session id in its own column", () => {
		runtime.sessions.setHarnessSessionId("s1", "claude-abc");
		const row = runtime.sessions.get("s1");
		expect(row).toMatchObject({
			sessionId: "s1",
			harnessSessionId: "claude-abc",
		});
	});

	test("reflects journal projection writes", () => {
		runtime.journal.append("s1", {
			type: "session",
			session: sessionState({ status: "awaiting_input", title: "Needs input" }),
		});
		expect(runtime.sessions.get("s1")).toMatchObject({
			status: "awaiting_input",
			title: "Needs input",
		});
	});

	test("returns null for an unknown session", () => {
		expect(runtime.sessions.get("nope")).toBeNull();
	});
});
