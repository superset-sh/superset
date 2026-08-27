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
	const requests: Array<{ json: { terminalId?: string } }> = [];
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
		expect(NOTIFY_SCRIPT_MARKER).toBe("# Superset agent notification hook v10");
	});

	it("ignores hooks fired inside a subagent (agent_id present)", () => {
		const result = runNotifyHook({
			hook_event_name: "PostToolUse",
			session_id: "main-session",
			agent_id: "a251e067cfdbabec7",
			agent_type: "general-purpose",
		});

		expect(result.exitCode).toBe(0);
		expect(result.stderr.toString()).toBe("");
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

		expect(script).toContain('HOOK_SESSION_ID=$(echo "$INPUT"');
		expect(script).toContain(
			'PAYLOAD="{\\"json\\":{\\"terminalId\\":\\"$(json_escape "$SUPERSET_TERMINAL_ID")\\",\\"eventType\\":\\"$(json_escape "$EVENT_TYPE")\\",\\"agent\\":{\\"agentId\\":\\"$(json_escape "$SUPERSET_AGENT_ID")\\",\\"sessionId\\":\\"$(json_escape "$SESSION_ID")\\"}}}"',
		);
		expect(script).toContain(
			"event=$EVENT_TYPE terminalId=$SUPERSET_TERMINAL_ID agentId=$SUPERSET_AGENT_ID sessionId=$SESSION_ID hookSessionId=$HOOK_SESSION_ID resourceId=$RESOURCE_ID paneId=$SUPERSET_PANE_ID tabId=$SUPERSET_TAB_ID workspaceId=$SUPERSET_WORKSPACE_ID",
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
		["copilot-hook.template.sh", "SUPERSET_AGENT_ID"],
		["gemini-hook.template.sh", "SUPERSET_AGENT_ID"],
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
