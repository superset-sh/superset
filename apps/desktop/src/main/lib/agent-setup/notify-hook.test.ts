import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { NOTIFY_SCRIPT_MARKER } from "./notify-hook";

const notifyHookTemplatePath = path.join(
	import.meta.dir,
	"templates",
	"notify-hook.template.sh",
);

function readNotifyHookTemplate(): string {
	return readFileSync(notifyHookTemplatePath, "utf-8");
}

function runNotifyHook(
	input: Record<string, unknown>,
	extraEnv: Record<string, string> = {},
) {
	const script = readNotifyHookTemplate()
		.replaceAll("{{MARKER}}", NOTIFY_SCRIPT_MARKER)
		.replaceAll("{{DEFAULT_PORT}}", "48763");
	return Bun.spawnSync({
		cmd: ["bash", "-c", script],
		env: {
			...process.env,
			SUPERSET_AGENT_ID: "grok",
			SUPERSET_DEBUG_HOOKS: "1",
			...extraEnv,
		},
		stdin: Buffer.from(JSON.stringify(input)),
		stdout: "pipe",
		stderr: "pipe",
	});
}

describe("getNotifyScriptContent", () => {
	it("bumps the notify hook marker when hook semantics change", () => {
		expect(NOTIFY_SCRIPT_MARKER).toBe("# Superset agent notification hook v6");
	});

	it("emits the v2 host-service payload with full agent identity", () => {
		const script = readNotifyHookTemplate();

		expect(script).toContain('HOOK_SESSION_ID=$(echo "$INPUT"');
		expect(script).toContain(
			'PAYLOAD="{\\"json\\":{\\"terminalId\\":\\"$(json_escape "$SUPERSET_TERMINAL_ID")\\",\\"eventType\\":\\"$(json_escape "$EVENT_TYPE")\\",\\"agent\\":{\\"agentId\\":\\"$(json_escape "$SUPERSET_AGENT_ID")\\",\\"sessionId\\":\\"$(json_escape "$SESSION_ID")\\"}}}"',
		);
		expect(script).toContain(
			"event=$EVENT_TYPE terminalId=$SUPERSET_TERMINAL_ID agentId=$SUPERSET_AGENT_ID hookSessionId=$HOOK_SESSION_ID resourceId=$RESOURCE_ID paneId=$SUPERSET_PANE_ID tabId=$SUPERSET_TAB_ID workspaceId=$SUPERSET_WORKSPACE_ID",
		);
		expect(script).toContain('V1_EVENT_TYPE="$EVENT_TYPE"');
		expect(script).toContain('V1_EVENT_TYPE="Stop"');
	});

	it("gives the v2 host-service hook enough time to deliver", () => {
		const script = readNotifyHookTemplate();

		expect(script).toContain(
			'curl -sX POST "$SUPERSET_HOST_AGENT_HOOK_URL" \\\n    --connect-timeout 2 --max-time 5',
		);
	});

	it("falls back to the v1 Electron hook when v2 is unavailable", () => {
		const script = readNotifyHookTemplate();

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

	// BSD grep honors GREP_OPTIONS and, with --color=always, wraps piped
	// matches in ANSI codes; without the unset guard every extraction comes
	// back empty and the hook silently drops the event.
	it("delivers events when the user's shell exports GREP_OPTIONS", () => {
		const result = runNotifyHook(
			{ session_id: "sess-123", hook_event_name: "Stop" },
			{ GREP_OPTIONS: "--color=always", GREP_COLOR: "1;35;40" },
		);

		expect(result.exitCode).toBe(0);
		expect(result.stderr.toString()).toContain("[notify-hook] event=Stop");
		expect(result.stderr.toString()).toContain("hookSessionId=sess-123");
	});
});

describe("per-agent hook scripts dispatch to v2", () => {
	const buildExpectedV2Payload = (agentIdVar: string) =>
		`PAYLOAD="{\\"json\\":{\\"terminalId\\":\\"$(json_escape "$SUPERSET_TERMINAL_ID")\\",\\"eventType\\":\\"$(json_escape "$EVENT_TYPE")\\",\\"agent\\":{\\"agentId\\":\\"$(json_escape "$${agentIdVar}")\\",\\"sessionId\\":\\"$(json_escape "$HOOK_SESSION_ID")\\"}}}"`;

	for (const [template, agentIdVar] of [
		["cursor-hook.template.sh", "AGENT_ID"],
		["copilot-hook.template.sh", "SUPERSET_AGENT_ID"],
		["gemini-hook.template.sh", "SUPERSET_AGENT_ID"],
	] as const) {
		it(`${template} posts v2 first and falls back to v1`, () => {
			const script = readFileSync(
				path.join(import.meta.dir, "templates", template),
				"utf-8",
			);
			expect(script).toContain("unset GREP_OPTIONS");
			expect(script).toContain(buildExpectedV2Payload(agentIdVar));
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
