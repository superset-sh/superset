import { describe, expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { NOTIFY_SCRIPT_MARKER } from "./notify-hook";

describe("getNotifyScriptContent", () => {
	it("bumps the notify hook marker when hook semantics change", () => {
		expect(NOTIFY_SCRIPT_MARKER).toBe("# Superset agent notification hook v5");
	});

	it("emits the v2 host-service payload with full agent identity", () => {
		const script = readFileSync(
			path.join(import.meta.dir, "templates", "notify-hook.template.sh"),
			"utf-8",
		);

		expect(script).toContain('HOOK_SESSION_ID=$(echo "$INPUT"');
		expect(script).toContain('"sessionId"[[:space:]]*:[[:space:]]*');
		expect(script).toContain('"hookEventName"[[:space:]]*:[[:space:]]*');
		expect(script).toContain('HOOK_SESSION_ID="$GROK_SESSION_ID"');
		expect(script).toContain('EVENT_TYPE="$GROK_HOOK_EVENT"');
		expect(script).toContain(
			'PAYLOAD="{\\"json\\":{\\"terminalId\\":\\"$(json_escape "$SUPERSET_TERMINAL_ID")\\",\\"eventType\\":\\"$(json_escape "$EVENT_TYPE")\\",\\"notificationType\\":\\"$(json_escape "$NOTIFICATION_TYPE")\\",\\"agent\\":{\\"agentId\\":\\"$(json_escape "$SUPERSET_AGENT_ID")\\",\\"sessionId\\":\\"$(json_escape "$SESSION_ID")\\"}}}"',
		);
		expect(script).toContain(
			"event=$EVENT_TYPE notificationType=$NOTIFICATION_TYPE terminalId=$SUPERSET_TERMINAL_ID agentId=$SUPERSET_AGENT_ID hookSessionId=$HOOK_SESSION_ID resourceId=$RESOURCE_ID paneId=$SUPERSET_PANE_ID tabId=$SUPERSET_TAB_ID workspaceId=$SUPERSET_WORKSPACE_ID",
		);
		expect(script).toContain("rawEventType=$EVENT_TYPE");
		expect(script).toContain("agentId=$SUPERSET_AGENT_ID");
		expect(script).toContain("notificationType=$NOTIFICATION_TYPE");
		expect(script).toContain('V1_EVENT_TYPE="$EVENT_TYPE"');
		expect(script).toContain('V1_EVENT_TYPE="Stop"');
	});

	it("gives the v2 host-service hook enough time to deliver", () => {
		const script = readFileSync(
			path.join(import.meta.dir, "templates", "notify-hook.template.sh"),
			"utf-8",
		);

		expect(script).toContain(
			'curl -sX POST "$SUPERSET_HOST_AGENT_HOOK_URL" \\\n    --connect-timeout 2 --max-time 5',
		);
	});

	it("falls back to the v1 Electron hook when v2 is unavailable", () => {
		const script = readFileSync(
			path.join(import.meta.dir, "templates", "notify-hook.template.sh"),
			"utf-8",
		);

		expect(script).toContain(
			'if [ -n "$SUPERSET_HOST_AGENT_HOOK_URL" ] && [ -n "$SUPERSET_TERMINAL_ID" ]; then',
		);
		expect(script).toContain(
			'[ -z "$SUPERSET_TAB_ID" ] && [ -z "$SESSION_ID" ] && [ -z "$SUPERSET_TERMINAL_ID" ] && exit 0',
		);
		expect(script).toContain("/hook/complete");
		expect(script).toContain("terminalId=$SUPERSET_TERMINAL_ID");
		expect(script).toContain("SUPERSET_TAB_ID");
		expect(script).toContain("SUPERSET_PANE_ID");
	});

	it("delivers Grok camelCase hook fields with Grok identity", () => {
		const root = mkdtempSync(path.join(os.tmpdir(), "superset-grok-notify-"));
		try {
			const fakeBinDir = path.join(root, "bin");
			const scriptPath = path.join(root, "notify.sh");
			const curlCapturePath = path.join(root, "curl-arguments.log");
			mkdirSync(fakeBinDir, { recursive: true });
			writeFileSync(
				path.join(fakeBinDir, "curl"),
				'#!/bin/bash\nprintf "%s\\n" "$@" > "$CURL_CAPTURE_PATH"\nprintf 204\n',
				{ mode: 0o755 },
			);
			chmodSync(path.join(fakeBinDir, "curl"), 0o755);

			const template = readFileSync(
				path.join(import.meta.dir, "templates", "notify-hook.template.sh"),
				"utf-8",
			);
			writeFileSync(
				scriptPath,
				template
					.replaceAll("{{MARKER}}", NOTIFY_SCRIPT_MARKER)
					.replaceAll("{{DEFAULT_PORT}}", "7777"),
				{ mode: 0o755 },
			);

			execFileSync("/bin/bash", [scriptPath], {
				input: JSON.stringify({
					hookEventName: "notification",
					notificationType: "permission_prompt",
					sessionId: "grok-session-123",
					cwd: "/tmp/project",
				}),
				env: {
					...process.env,
					CURL_CAPTURE_PATH: curlCapturePath,
					PATH: `${fakeBinDir}:${process.env.PATH ?? ""}`,
					SUPERSET_AGENT_ID: "grok",
					SUPERSET_HOST_AGENT_HOOK_URL: "http://127.0.0.1:9999/hook",
					SUPERSET_TERMINAL_ID: "terminal-123",
				},
			});

			const curlArguments = readFileSync(curlCapturePath, "utf-8");
			expect(curlArguments).toContain("http://127.0.0.1:9999/hook");
			expect(curlArguments).toContain(
				'{"json":{"terminalId":"terminal-123","eventType":"notification","notificationType":"permission_prompt","agent":{"agentId":"grok","sessionId":"grok-session-123"}}}',
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("per-agent hook scripts dispatch to v2", () => {
	const expectedV2Payload =
		'PAYLOAD="{\\"json\\":{\\"terminalId\\":\\"$(json_escape "$SUPERSET_TERMINAL_ID")\\",\\"eventType\\":\\"$(json_escape "$EVENT_TYPE")\\",\\"agent\\":{\\"agentId\\":\\"$(json_escape "$SUPERSET_AGENT_ID")\\",\\"sessionId\\":\\"$(json_escape "$HOOK_SESSION_ID")\\"}}}"';

	for (const template of [
		"cursor-hook.template.sh",
		"copilot-hook.template.sh",
		"gemini-hook.template.sh",
	]) {
		it(`${template} posts v2 first and falls back to v1`, () => {
			const script = readFileSync(
				path.join(import.meta.dir, "templates", template),
				"utf-8",
			);
			expect(script).toContain(expectedV2Payload);
			expect(script).toContain('curl -sX POST "$SUPERSET_HOST_AGENT_HOOK_URL"');
			expect(script).toContain(
				'if [ -n "$SUPERSET_HOST_AGENT_HOOK_URL" ] && [ -n "$SUPERSET_TERMINAL_ID" ]; then',
			);
			expect(script).toContain("/hook/complete");
			expect(script).toContain('V1_EVENT_TYPE="$EVENT_TYPE"');
			expect(script).toContain("eventType=$V1_EVENT_TYPE");
			expect(script).toContain("terminalId=$SUPERSET_TERMINAL_ID");
			expect(script).toContain("SUPERSET_TAB_ID");
			expect(script).toContain("SUPERSET_PANE_ID");
		});
	}
});
