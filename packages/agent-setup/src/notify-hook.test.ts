import { describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getTemplatePath } from "./config";
import { NOTIFY_SCRIPT_MARKER } from "./notify-hook";

function readNotifyHookTemplate(): string {
	return readFileSync(getTemplatePath("notify-hook.template.sh"), "utf-8");
}

// The script scans ${SUPERSET_HOME_DIR:-$HOME/.superset}/host/*/manifest.json
// at call time. Tests must never resolve the developer's real manifests (this
// test process can itself run inside a Superset terminal), so the default env
// points at an empty home.
const emptyHome = mkdtempSync(path.join(tmpdir(), "notify-hook-empty-home-"));

function renderNotifyHookScript(): string {
	return readNotifyHookTemplate()
		.replaceAll("{{MARKER}}", NOTIFY_SCRIPT_MARKER)
		.replaceAll("{{DEFAULT_PORT}}", "48763");
}

function hookEnv(envOverrides: Record<string, string>) {
	return {
		...process.env,
		SUPERSET_AGENT_ID: "grok",
		SUPERSET_DEBUG_HOOKS: "1",
		SUPERSET_TERMINAL_ID: "terminal-test",
		SUPERSET_HOME_DIR: emptyHome,
		...envOverrides,
	};
}

function runNotifyHook(
	input: Record<string, unknown>,
	envOverrides: Record<string, string> = {},
) {
	return Bun.spawnSync({
		cmd: ["bash", "-c", renderNotifyHookScript()],
		env: hookEnv(envOverrides),
		stdin: Buffer.from(JSON.stringify(input)),
		stdout: "pipe",
		stderr: "pipe",
	});
}

/**
 * Async variant for tests that stand up an in-process Bun.serve fake
 * host-service: spawnSync would block the event loop and deadlock the
 * hook's curl against that server.
 */
async function runNotifyHookAsync(
	input: Record<string, unknown>,
	envOverrides: Record<string, string> = {},
) {
	const proc = Bun.spawn({
		cmd: ["bash", "-c", renderNotifyHookScript()],
		env: hookEnv(envOverrides),
		stdin: Buffer.from(JSON.stringify(input)),
		stdout: "pipe",
		stderr: "pipe",
	});
	const [exitCode, stderr] = await Promise.all([
		proc.exited,
		new Response(proc.stderr).text(),
	]);
	return { exitCode, stderr };
}

/** Fake host-service answering notifications.hook like the real router. */
function fakeHostService(ignored: boolean) {
	const requests: Array<{ json: Record<string, unknown> }> = [];
	const server = Bun.serve({
		port: 0,
		fetch: async (req) => {
			requests.push((await req.json()) as (typeof requests)[number]);
			return Response.json({
				result: { data: { json: { success: true, ignored } } },
			});
		},
	});
	return {
		requests,
		url: `http://127.0.0.1:${server.port}`,
		stop: () => server.stop(true),
	};
}

function writeHookManifest(home: string, orgId: string, endpoint: string) {
	const dir = path.join(home, "host", orgId);
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		path.join(dir, "manifest.json"),
		JSON.stringify({
			pid: 1,
			endpoint,
			authToken: "test-token",
			startedAt: 0,
			organizationId: orgId,
		}),
	);
}

describe("getNotifyScriptContent", () => {
	it("bumps the notify hook marker when hook semantics change", () => {
		expect(NOTIFY_SCRIPT_MARKER).toBe("# Superset agent notification hook v16");
	});

	it("forwards hooks fired inside a subagent (agent_id present) to the host roster only", async () => {
		const host = fakeHostService(false);
		try {
			const result = await runNotifyHookAsync(
				{
					hook_event_name: "SubagentStart",
					session_id: "child-thread",
					transcript_path: "/tmp/sessions/child-thread.jsonl",
					agent_id: "a251e067cfdbabec7",
					agent_type: "general-purpose",
				},
				{ SUPERSET_HOST_AGENT_HOOK_URL: `${host.url}/trpc/notifications.hook` },
			);
			expect(result.exitCode).toBe(0);
			expect(host.requests).toEqual([
				{
					json: {
						terminalId: "terminal-test",
						eventType: "SubagentStart",
						subagent: {
							id: "a251e067cfdbabec7",
							type: "general-purpose",
							sessionId: "child-thread",
							transcriptPath: "/tmp/sessions/child-thread.jsonl",
							agentTranscriptPath: "",
						},
					},
				},
			]);
			// The child's session id rides inside `subagent` only, never as the
			// terminal's agent identity.
			expect(host.requests[0]?.json.agent).toBeUndefined();
		} finally {
			host.stop();
		}
	});

	it("accepts camelCase aliases in a subagent hook payload", async () => {
		const host = fakeHostService(false);
		try {
			const result = await runNotifyHookAsync(
				{
					hookEventName: "SubagentStop",
					sessionId: "child-thread",
					transcriptPath: "/tmp/sessions/parent.jsonl",
					agentTranscriptPath: "/tmp/sessions/child.jsonl",
					agentId: "child-1",
					agentType: "Explore",
				},
				{ SUPERSET_HOST_AGENT_HOOK_URL: `${host.url}/trpc/notifications.hook` },
			);
			expect(result.exitCode).toBe(0);
			expect(host.requests).toEqual([
				{
					json: {
						terminalId: "terminal-test",
						eventType: "SubagentStop",
						subagent: {
							id: "child-1",
							type: "Explore",
							sessionId: "child-thread",
							transcriptPath: "/tmp/sessions/parent.jsonl",
							agentTranscriptPath: "/tmp/sessions/child.jsonl",
						},
					},
				},
			]);
		} finally {
			host.stop();
		}
	});

	it("takes the first match when a field recurs in nested objects", async () => {
		// Claude's SubagentStop repeats agent_type inside background_tasks; a
		// second match used to join with a newline and break the JSON body.
		const host = fakeHostService(false);
		try {
			const result = await runNotifyHookAsync(
				{
					hook_event_name: "SubagentStop",
					session_id: "parent",
					transcript_path: "/tmp/sessions/parent.jsonl",
					agent_transcript_path:
						"/tmp/sessions/parent/subagents/agent-a1.jsonl",
					agent_id: "a1",
					agent_type: "Explore",
					background_tasks: [
						{
							id: "b1",
							type: "subagent",
							agent_type: "Plan",
							status: "running",
						},
					],
				},
				{ SUPERSET_HOST_AGENT_HOOK_URL: `${host.url}/trpc/notifications.hook` },
			);
			expect(result.exitCode).toBe(0);
			expect(host.requests).toHaveLength(1);
			expect(host.requests[0]?.json.subagent).toEqual({
				id: "a1",
				type: "Explore",
				sessionId: "parent",
				transcriptPath: "/tmp/sessions/parent.jsonl",
				agentTranscriptPath: "/tmp/sessions/parent/subagents/agent-a1.jsonl",
			});
		} finally {
			host.stop();
		}
	});

	it("does not dispatch subagent hooks anywhere without a terminal id", () => {
		const result = runNotifyHook(
			{
				hook_event_name: "PostToolUse",
				session_id: "main-session",
				agent_id: "a251e067cfdbabec7",
			},
			{ SUPERSET_TERMINAL_ID: "", SUPERSET_TAB_ID: "tab-1" },
		);

		expect(result.exitCode).toBe(0);
		expect(result.stderr.toString()).not.toContain("dispatched");
	});

	it("still dispatches main-loop hooks without agent_id", () => {
		const result = runNotifyHook({
			hook_event_name: "Stop",
			session_id: "main-session",
		});

		expect(result.exitCode).toBe(0);
		expect(result.stderr.toString()).toContain("[notify-hook] event=Stop");
	});

	it("exits silently outside Superset terminals even with a payload session id", () => {
		const result = runNotifyHook(
			{ hook_event_name: "Stop", session_id: "foreign-session" },
			{ SUPERSET_TERMINAL_ID: "", SUPERSET_TAB_ID: "" },
		);

		expect(result.exitCode).toBe(0);
		expect(result.stderr.toString()).toBe("");
	});

	it("emits the v2 host-service payload with full agent identity", () => {
		const script = readNotifyHookTemplate();

		expect(script).toContain(
			"HOOK_SESSION_ID=$(json_field session_id sessionId)",
		);
		expect(script).toContain(
			'dispatch_to_host "{\\"json\\":{\\"terminalId\\":\\"$(json_escape "$SUPERSET_TERMINAL_ID")\\",\\"eventType\\":\\"$(json_escape "$EVENT_TYPE")\\",\\"agent\\":{\\"agentId\\":\\"$(json_escape "$AGENT_ID")\\",\\"sessionId\\":\\"$(json_escape "$SESSION_ID")\\"}$PREVIEW_FIELD}}"',
		);
		// One dispatcher serves both the agent and subagent payloads.
		expect(script.split('dispatch_to_host "').length - 1).toBe(2);
		expect(
			script.split('HOOK_CANDIDATE_URLS="$SUPERSET_HOST_AGENT_HOOK_URL"')
				.length - 1,
		).toBe(1);
		expect(script).toContain(
			"event=$EVENT_TYPE terminalId=$SUPERSET_TERMINAL_ID agentId=$AGENT_ID subagentId=$SUBAGENT_ID sessionId=$SESSION_ID hookSessionId=$HOOK_SESSION_ID resourceId=$RESOURCE_ID paneId=$SUPERSET_PANE_ID tabId=$SUPERSET_TAB_ID workspaceId=$SUPERSET_WORKSPACE_ID",
		);
		expect(script).toContain('V1_EVENT_TYPE="$EVENT_TYPE"');
		expect(script).toContain('V1_EVENT_TYPE="Stop"');
	});

	it("gives the v2 host-service hook enough time to deliver", () => {
		const script = readNotifyHookTemplate();

		expect(script).toContain(
			'curl -sX POST "$HOOK_URL" \\\n      --connect-timeout 2 --max-time 5',
		);
	});

	it("resolves the endpoint at call time from org manifests, not only the frozen env URL", () => {
		const script = readNotifyHookTemplate();

		expect(script).toContain("SUPERSET_HOME_DIR:-$HOME/.superset");
		expect(script).toContain("/host/*/manifest.json; do");
		expect(script).toContain(
			'HOOK_CANDIDATE_URLS="$SUPERSET_HOST_AGENT_HOOK_URL"',
		);
		expect(script).toContain("/trpc/notifications.hook");
	});

	it("falls back to the v1 Electron hook when v2 is unavailable", () => {
		const script = readNotifyHookTemplate();

		expect(script).toContain('if [ -n "$SUPERSET_TERMINAL_ID" ]; then');
		expect(script).toContain(
			'[ -z "$SUPERSET_TAB_ID" ] && [ -z "$SESSION_ID" ] && [ -z "$SUPERSET_TERMINAL_ID" ] && exit 0',
		);
		expect(script).toContain("/hook/complete");
		expect(script).toContain("terminalId=$SUPERSET_TERMINAL_ID");
		expect(script).toContain("SUPERSET_TAB_ID");
		expect(script).toContain("SUPERSET_PANE_ID");
	});

	it("extracts the codex thread-id as the session id on turn completion", () => {
		// Exact shape of codex's legacy notify callback (captured from
		// codex-cli 0.146): the resumable id rides in kebab-case thread-id.
		const result = runNotifyHook({
			type: "agent-turn-complete",
			"thread-id": "019fdecb-edc4-7671-91ba-967a367cda56",
			"turn-id": "019fdecb-edec-7390-8ccb-50060c49c32f",
			cwd: "/tmp",
			"input-messages": ["Reply with exactly: OK"],
			"last-assistant-message": "OK",
		});

		expect(result.exitCode).toBe(0);
		const stderr = result.stderr.toString();
		expect(stderr).toContain("[notify-hook] event=Stop");
		expect(stderr).toContain("sessionId=019fdecb-edc4-7671-91ba-967a367cda56");
	});

	it("prefers an explicit session_id over thread-id", () => {
		const result = runNotifyHook({
			hook_event_name: "Stop",
			session_id: "real-session",
			"thread-id": "should-not-win",
		});

		expect(result.exitCode).toBe(0);
		expect(result.stderr.toString()).toContain("sessionId=real-session");
	});

	it("normalizes Grok permission notifications to PermissionRequest", () => {
		const result = runNotifyHook({
			hookEventName: "notification",
			notificationType: "permission_prompt",
		});

		expect(result.exitCode).toBe(0);
		expect(result.stderr.toString()).toContain(
			"[notify-hook] event=PermissionRequest",
		);
	});

	it("normalizes Grok ask_user_question notifications to PermissionRequest", () => {
		const result = runNotifyHook({
			hookEventName: "notification",
			notificationType: "elicitation_dialog",
		});

		expect(result.exitCode).toBe(0);
		expect(result.stderr.toString()).toContain(
			"[notify-hook] event=PermissionRequest",
		);
	});

	it("ignores unrelated Grok notification subtypes", () => {
		const result = runNotifyHook({
			hookEventName: "notification",
			notificationType: "idle_prompt",
		});

		expect(result.exitCode).toBe(0);
		expect(result.stderr.toString()).toBe("");
	});
});

describe("per-agent hook scripts dispatch to v2", () => {
	const buildExpectedV2Payload = (agentIdVar: string) =>
		`PAYLOAD="{\\"json\\":{\\"terminalId\\":\\"$(json_escape "$SUPERSET_TERMINAL_ID")\\",\\"eventType\\":\\"$(json_escape "$EVENT_TYPE")\\",\\"agent\\":{\\"agentId\\":\\"$(json_escape "$${agentIdVar}")\\",\\"sessionId\\":\\"$(json_escape "$HOOK_SESSION_ID")\\"}}}"`;

	it("cursor auto-approves permission requests before the outside-Superset bail-out", () => {
		const script = readFileSync(
			getTemplatePath("cursor-hook.template.sh"),
			"utf-8",
		);
		const approveIndex = script.indexOf("printf '{\"continue\":true}\\n'");
		const bailOutIndex = script.indexOf(
			'[ -n "$SUPERSET_TERMINAL_ID" ] || [ -n "$SUPERSET_TAB_ID" ] || exit 0',
		);
		expect(approveIndex).toBeGreaterThan(-1);
		expect(bailOutIndex).toBeGreaterThan(approveIndex);
	});

	for (const [template, agentIdVar] of [
		["cursor-hook.template.sh", "AGENT_ID"],
		["copilot-hook.template.sh", "AGENT_ID"],
		["gemini-hook.template.sh", "AGENT_ID"],
	] as const) {
		it(`${template} posts v2 first and falls back to v1`, () => {
			const script = readFileSync(getTemplatePath(template), "utf-8");
			expect(script).toContain(
				'[ -n "$SUPERSET_TERMINAL_ID" ] || [ -n "$SUPERSET_TAB_ID" ] || exit 0',
			);
			expect(script).toContain(buildExpectedV2Payload(agentIdVar));
			expect(script).toContain('curl -sX POST "$HOOK_URL"');
			expect(script).toContain("SUPERSET_HOME_DIR:-$HOME/.superset");
			expect(script).toContain("/host/*/manifest.json; do");
			expect(script).toContain('if [ -n "$SUPERSET_TERMINAL_ID" ]; then');
			expect(script).toContain("/hook/complete");
			expect(script).toContain('V1_EVENT_TYPE="$EVENT_TYPE"');
			expect(script).toContain("eventType=$V1_EVENT_TYPE");
			expect(script).toContain("terminalId=$SUPERSET_TERMINAL_ID");
			expect(script).toContain("SUPERSET_TAB_ID");
			expect(script).toContain("SUPERSET_PANE_ID");
		});
	}
});

describe("call-time endpoint resolution (frozen-port healing)", () => {
	const stopEvent = { hook_event_name: "Stop", session_id: "s1" };
	// A guaranteed-dead localhost URL, standing in for the port a previous
	// host-service instance captured into the agent's env before restarting.
	const deadUrl = "http://127.0.0.1:1/trpc/notifications.hook";

	it("delivers via the org manifest when the env hook URL points at a dead port", async () => {
		const live = fakeHostService(false);
		const home = mkdtempSync(path.join(tmpdir(), "notify-hook-home-"));
		writeHookManifest(home, "org-a", live.url);
		try {
			const result = await runNotifyHookAsync(stopEvent, {
				SUPERSET_HOME_DIR: home,
				SUPERSET_HOST_AGENT_HOOK_URL: deadUrl,
			});

			expect(result.exitCode).toBe(0);
			expect(live.requests).toHaveLength(1);
			expect(live.requests[0]?.json.terminalId).toBe("terminal-test");
			expect(result.stderr).toContain("status=000");
			expect(result.stderr).toContain(`status=200 url=${live.url}`);
		} finally {
			live.stop();
		}
	});

	it("keeps probing past a host that does not own the terminal (ignored:true)", async () => {
		const wrongOrg = fakeHostService(true);
		const owningOrg = fakeHostService(false);
		const home = mkdtempSync(path.join(tmpdir(), "notify-hook-home-"));
		// org-a sorts before org-b in the manifest glob, so the wrong host is
		// probed first and must not terminate the dispatch.
		writeHookManifest(home, "org-a", wrongOrg.url);
		writeHookManifest(home, "org-b", owningOrg.url);
		try {
			const result = await runNotifyHookAsync(stopEvent, {
				SUPERSET_HOME_DIR: home,
				SUPERSET_HOST_AGENT_HOOK_URL: deadUrl,
			});

			expect(result.exitCode).toBe(0);
			expect(wrongOrg.requests).toHaveLength(1);
			expect(owningOrg.requests).toHaveLength(1);
		} finally {
			wrongOrg.stop();
			owningOrg.stop();
		}
	});

	it("uses the env URL fast path without probing manifests when it answers", async () => {
		const envHost = fakeHostService(false);
		const manifestHost = fakeHostService(false);
		const home = mkdtempSync(path.join(tmpdir(), "notify-hook-home-"));
		writeHookManifest(home, "org-a", manifestHost.url);
		try {
			const result = await runNotifyHookAsync(stopEvent, {
				SUPERSET_HOME_DIR: home,
				SUPERSET_HOST_AGENT_HOOK_URL: `${envHost.url}/trpc/notifications.hook`,
			});

			expect(result.exitCode).toBe(0);
			expect(envHost.requests).toHaveLength(1);
			expect(manifestHost.requests).toHaveLength(0);
		} finally {
			envHost.stop();
			manifestHost.stop();
		}
	});
});

describe("agent identity precedence", () => {
	const stop = { hook_event_name: "Stop", session_id: "s1" };

	async function dispatched(
		envOverrides: Record<string, string>,
		input: Record<string, unknown> = stop,
	) {
		const host = fakeHostService(false);
		try {
			const result = await runNotifyHookAsync(input, {
				SUPERSET_HOST_AGENT_HOOK_URL: `${host.url}/trpc/notifications.hook`,
				SUPERSET_HOOK_HARNESS: "",
				CURSOR_AGENT: "",
				CURSOR_CLI: "",
				CURSOR_VERSION: "",
				...envOverrides,
			});
			expect(result.exitCode).toBe(0);
			return host.requests.map((request) => request.json);
		} finally {
			host.stop();
		}
	}

	it("reports the wrapper's identity when its own harness's hook config fires", async () => {
		expect(
			await dispatched({
				SUPERSET_AGENT_ID: "codex",
				SUPERSET_HOOK_HARNESS: "codex",
			}),
		).toEqual([
			{
				terminalId: "terminal-test",
				eventType: "Stop",
				agent: { agentId: "codex", sessionId: "s1" },
			},
		]);
	});

	it("reports the wrapper's identity for the wrapper's own launch report", async () => {
		expect(
			await dispatched(
				{ SUPERSET_AGENT_ID: "opencode" },
				{ hook_event_name: "SessionStart" },
			),
		).toEqual([
			{
				terminalId: "terminal-test",
				eventType: "SessionStart",
				agent: { agentId: "opencode", sessionId: "" },
			},
		]);
	});

	it.each([
		"opencode",
		"",
	])("captures OpenCode's resumable session with wrapper identity %j", async (wrapperIdentity) => {
		expect(
			await dispatched(
				{
					SUPERSET_AGENT_ID: wrapperIdentity,
					SUPERSET_HOOK_HARNESS: "opencode",
				},
				{ hook_event_name: "Stop", session_id: "ses_opencode" },
			),
		).toEqual([
			{
				terminalId: "terminal-test",
				eventType: "Stop",
				agent: { agentId: "opencode", sessionId: "ses_opencode" },
			},
		]);
	});

	it("drops a nested OpenCode plugin's lifecycle and session ID", async () => {
		expect(
			await dispatched(
				{
					SUPERSET_AGENT_ID: "claude",
					SUPERSET_HOOK_HARNESS: "opencode",
				},
				{ hook_event_name: "Stop", session_id: "ses_child" },
			),
		).toEqual([]);
	});

	it("names the agent from the hook config when no wrapper exported an identity", async () => {
		// The binary was resolved from the system PATH: the config that
		// fired is the only identity there is.
		expect(
			await dispatched({
				SUPERSET_AGENT_ID: "",
				SUPERSET_HOOK_HARNESS: "claude",
			}),
		).toEqual([
			{
				terminalId: "terminal-test",
				eventType: "Stop",
				agent: { agentId: "claude", sessionId: "s1" },
			},
		]);
	});

	it("drops another harness's hook config firing under the terminal's agent", async () => {
		// Claude's Bash tool running `codex exec`: Codex's config fires with
		// the Claude wrapper's identity still exported. The Codex thread id
		// must not become the Claude terminal's resumable session.
		expect(
			await dispatched({
				SUPERSET_AGENT_ID: "claude",
				SUPERSET_HOOK_HARNESS: "codex",
			}),
		).toEqual([]);
		expect(
			await dispatched(
				{ SUPERSET_AGENT_ID: "claude", SUPERSET_HOOK_HARNESS: "codex" },
				{
					hook_event_name: "SubagentStart",
					agent_id: "child-1",
					session_id: "child-thread",
				},
			),
		).toEqual([]);
	});

	it("drops Claude's hook config replayed by cursor-agent", async () => {
		// cursor-agent loads ~/.claude/settings.json and fires Claude's hooks
		// with its own event names; the Cursor session id and identity ride
		// cursor-hook.sh instead. Verified on cursor-agent 2026.09.02.
		const replay = { hook_event_name: "sessionStart", session_id: "cursor-1" };
		expect(
			await dispatched(
				{
					SUPERSET_AGENT_ID: "cursor-agent",
					SUPERSET_HOOK_HARNESS: "claude",
					CURSOR_AGENT: "1",
					CURSOR_VERSION: "2026.09.02-c22c1a3",
				},
				replay,
			),
		).toEqual([]);
		// Launched without the wrapper, Cursor's env is the only tell.
		for (const tell of ["CURSOR_AGENT", "CURSOR_CLI", "CURSOR_VERSION"]) {
			expect(
				await dispatched(
					{
						SUPERSET_AGENT_ID: "",
						SUPERSET_HOOK_HARNESS: "claude",
						[tell]: "1",
					},
					replay,
				),
			).toEqual([]);
		}
	});
});

describe("cursor-hook.template.sh identity", () => {
	function renderCursorHook(): string {
		return readFileSync(getTemplatePath("cursor-hook.template.sh"), "utf-8")
			.replaceAll("{{MARKER}}", "# test hook")
			.replaceAll("{{DEFAULT_PORT}}", "48763");
	}

	async function runCursorHook(
		eventArg: string,
		envOverrides: Record<string, string>,
	) {
		const host = fakeHostService(false);
		try {
			const proc = Bun.spawn({
				cmd: ["bash", "-c", renderCursorHook(), "cursor-hook.sh", eventArg],
				env: hookEnv({
					SUPERSET_HOST_AGENT_HOOK_URL: `${host.url}/trpc/notifications.hook`,
					CURSOR_AGENT: "",
					CURSOR_CLI: "",
					...envOverrides,
				}),
				stdin: Buffer.from(JSON.stringify({ session_id: "cursor-1" })),
				stdout: "pipe",
				stderr: "pipe",
			});
			const [exitCode, stdout] = await Promise.all([
				proc.exited,
				new Response(proc.stdout).text(),
			]);
			expect(exitCode).toBe(0);
			return { stdout, requests: host.requests.map((request) => request.json) };
		} finally {
			host.stop();
		}
	}

	it("reports the wrapper's cursor-agent identity", async () => {
		expect(
			(await runCursorHook("Stop", { SUPERSET_AGENT_ID: "cursor-agent" }))
				.requests,
		).toEqual([
			{
				terminalId: "terminal-test",
				eventType: "Stop",
				agent: { agentId: "cursor-agent", sessionId: "cursor-1" },
			},
		]);
	});

	it("tells cursor-agent from the IDE Composer when launched without the wrapper", async () => {
		const cli = await runCursorHook("Stop", {
			SUPERSET_AGENT_ID: "",
			CURSOR_AGENT: "1",
		});
		expect(cli.requests[0]?.agent).toEqual({
			agentId: "cursor-agent",
			sessionId: "cursor-1",
		});
		const composer = await runCursorHook("Stop", { SUPERSET_AGENT_ID: "" });
		expect(composer.requests[0]?.agent).toEqual({
			agentId: "cursor-composer",
			sessionId: "cursor-1",
		});
	});

	it("drops events from cursor-agent running under another agent, after auto-approving", async () => {
		const nested = await runCursorHook("PermissionRequest", {
			SUPERSET_AGENT_ID: "claude",
			CURSOR_AGENT: "1",
		});
		// The approval must still reach cursor-agent or the tool call hangs.
		expect(nested.stdout).toBe('{"continue":true}\n');
		expect(nested.requests).toEqual([]);
	});
});

describe("notification content previews", () => {
	for (const key of [
		"last_assistant_message",
		"last-assistant-message",
		"message",
	]) {
		it(`forwards ${key} with JSON escaping intact`, async () => {
			const host = fakeHostService(false);
			try {
				const preview = 'Finished "B".\nPath: C:\\repo\nUnicode: 日本語';
				const result = await runNotifyHookAsync(
					{ hook_event_name: "Stop", [key]: preview },
					{ SUPERSET_HOST_AGENT_HOOK_URL: host.url },
				);
				expect(result.exitCode).toBe(0);
				expect(host.requests[0]?.json.preview).toBe(preview);
			} finally {
				host.stop();
			}
		});
	}
	it("does not forward prompt text on Start", async () => {
		const host = fakeHostService(false);
		try {
			await runNotifyHookAsync(
				{ hook_event_name: "Start", message: "user prompt" },
				{ SUPERSET_HOST_AGENT_HOOK_URL: host.url },
			);
			expect(host.requests[0]?.json.preview).toBeUndefined();
		} finally {
			host.stop();
		}
	});
});

it("prefers the current permission message over assistant output", async () => {
	const host = fakeHostService(false);
	try {
		await runNotifyHookAsync(
			{
				hook_event_name: "PermissionRequest",
				message: "Allow this command?",
				last_assistant_message: "Earlier summary",
			},
			{ SUPERSET_HOST_AGENT_HOOK_URL: host.url },
		);
		expect(host.requests[0]?.json.preview).toBe("Allow this command?");
	} finally {
		host.stop();
	}
});
