import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import * as fs from "node:fs";
import {
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import * as os from "node:os";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hasHarnessSession, readHarnessTranscript } from ".";

const sessionId = "019f5cac-9077-73d2-83a3-f17e383fc705";
const created: string[] = [];
let home: string;
let homedirSpy: ReturnType<typeof spyOn>;

beforeEach(() => {
	home = realpathSync(mkdtempSync(join(tmpdir(), "codex-home-")));
	created.push(home);
	homedirSpy = spyOn(os, "homedir").mockReturnValue(home);
});

afterEach(() => {
	homedirSpy.mockRestore();
	for (const path of created.splice(0)) {
		rmSync(path, { recursive: true, force: true });
	}
});

const message = (role: string, text: string, type = "input_text") => ({
	type: "message",
	role,
	content: [{ type, text }],
});
const responseItem = (payload: unknown) =>
	JSON.stringify({ type: "response_item", payload });

function seedRollout(
	codexHome: string,
	lines: string[],
	{
		day = "2026/09/21",
		name = `rollout-2026-09-21T09-00-05-${sessionId}.jsonl`,
	} = {},
): string {
	const dir = join(home, codexHome, "sessions", day);
	mkdirSync(dir, { recursive: true });
	const path = join(dir, name);
	writeFileSync(path, `${lines.join("\n")}\n`);
	return path;
}

const workEnv = () => ({ CODEX_HOME: join(home, ".codex-work") });
const read = (env: Record<string, string> = workEnv()) =>
	readHarnessTranscript({ agentId: "codex", sessionId, env }, 36_000)?.text;

describe("codex session files", () => {
	test("reads the conversation and skips what Codex injects as user turns", () => {
		seedRollout(".codex-work", [
			JSON.stringify({ type: "session_meta", payload: { id: sessionId } }),
			responseItem(message("developer", "<permissions instructions>")),
			responseItem(
				message("user", "# AGENTS.md instructions for /repo\n\nrules"),
			),
			responseItem(
				message("user", "<environment_context>\n  <cwd>/repo</cwd>"),
			),
			responseItem(message("user", "<recommended_plugins>\n- x")),
			responseItem(message("user", "<skill>\nbody\n</skill>")),
			responseItem(message("user", "Fix the flaky test.")),
			responseItem({ type: "reasoning", summary: [{ text: "thinking" }] }),
			responseItem({ type: "custom_tool_call", name: "exec", input: "ls" }),
			responseItem({ type: "custom_tool_call_output", output: "a\nb" }),
			responseItem(message("assistant", "Fixed it.", "output_text")),
			'{"type":"response_item","payload":{"type":"mess',
		]);

		expect(read()).toBe("User: Fix the flaky test.\n\nAssistant: Fixed it.");
	});

	test("reads rollouts written before items were wrapped in response_item", () => {
		seedRollout(".codex-work", [
			JSON.stringify({ id: sessionId, timestamp: "2025-11-05T23:38:31.777Z" }),
			JSON.stringify({ record_type: "state" }),
			JSON.stringify(message("user", "<environment_context>\n  <cwd>/r</cwd>")),
			JSON.stringify(message("user", "review this branch")),
			JSON.stringify(message("assistant", "Looks good.", "output_text")),
		]);

		expect(read()).toBe("User: review this branch\n\nAssistant: Looks good.");
	});

	test("matches the rollout by id suffix in any date directory", () => {
		seedRollout(".codex-work", [responseItem(message("user", "decoy"))], {
			day: "2026/09/22",
			name: "rollout-2026-09-22T10-00-00-00000000-0000-7000-8000-000000000000.jsonl",
		});
		seedRollout(".codex-work", [responseItem(message("user", "found"))], {
			day: "2025/11/05",
		});

		expect(read()).toBe("User: found");
	});

	test("reads the newest rollout when a revert gave the thread another file", () => {
		seedRollout(".codex-work", [
			responseItem(message("user", "before the revert")),
		]);
		seedRollout(
			".codex-work",
			[responseItem(message("user", "after the revert"))],
			{
				name: `rollout-2026-09-21T10-00-00-${sessionId}_019f5cad-0000-7000-8000-000000000000.jsonl`,
			},
		);
		seedRollout(
			".codex-work",
			[responseItem(message("user", "another thread"))],
			{
				name: `rollout-2026-09-21T11-00-00-${sessionId.slice(0, -1)}0.jsonl`,
			},
		);
		expect(read()).toBe("User: after the revert");
	});

	test("reads a session left in the default home after the account switched", () => {
		seedRollout(".codex", [responseItem(message("user", "before the switch"))]);
		mkdirSync(join(home, ".codex-work", "sessions"), { recursive: true });

		expect(read()).toBe("User: before the switch");
		// A relaunch runs under the new account's home and would not find it.
		expect(
			hasHarnessSession({ agentId: "codex", sessionId, env: workEnv() }),
		).toBe(false);
	});

	test("prefers the launch env's home when both hold the session", () => {
		seedRollout(".codex", [responseItem(message("user", "default home"))]);
		seedRollout(".codex-work", [responseItem(message("user", "account home"))]);
		expect(read()).toBe("User: account home");
	});

	test("counts a compressed rollout as the session but cannot read it", () => {
		seedRollout(".codex-work", ["compressed"], {
			name: `rollout-2026-09-21T09-00-05-${sessionId}.jsonl.zst`,
		});
		expect(
			hasHarnessSession({ agentId: "codex", sessionId, env: workEnv() }),
		).toBe(true);
		expect(read()).toBeUndefined();
	});

	test("answers unknown without a sessions directory or past the walk's cap", () => {
		expect(
			hasHarnessSession({ agentId: "codex", sessionId, env: workEnv() }),
		).toBeNull();

		const sessions = join(home, ".codex-work", "sessions");
		for (let i = 0; i < 2_000; i++)
			mkdirSync(join(sessions, `d${i}`), { recursive: true });
		expect(
			hasHarnessSession({ agentId: "codex", sessionId, env: workEnv() }),
		).toBeNull();
	});

	test("falls back to the stream instead of failing when the store cannot be read", () => {
		seedRollout(".codex-work", [responseItem(message("user", "unreachable"))]);
		const readdir = spyOn(fs, "readdirSync").mockImplementation(() => {
			throw Object.assign(new Error("EACCES"), { code: "EACCES" });
		});
		try {
			expect(read()).toBeUndefined();
		} finally {
			readdir.mockRestore();
		}
	});

	test("reads the path Codex's hook reported", () => {
		const reportedPath = seedRollout(".elsewhere", [
			JSON.stringify({ type: "session_meta", payload: { id: sessionId } }),
			responseItem(message("user", "from the hook's path")),
		]);
		expect(
			readHarnessTranscript(
				{ agentId: "codex", sessionId, env: workEnv(), reportedPath },
				36_000,
			)?.text,
		).toBe("User: from the hook's path");
	});
});
