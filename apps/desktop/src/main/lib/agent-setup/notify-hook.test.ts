import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getNotifyScriptContent, NOTIFY_SCRIPT_MARKER } from "./notify-hook";

describe("getNotifyScriptContent", () => {
	it("bumps the notify hook marker when hook semantics change", () => {
		expect(NOTIFY_SCRIPT_MARKER).toBe("# Superset agent notification hook v4");
	});

	it("emits the v2 host-service payload with full agent identity", () => {
		const script = readFileSync(
			path.join(import.meta.dir, "templates", "notify-hook.template.sh"),
			"utf-8",
		);

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
		const script = readFileSync(
			path.join(import.meta.dir, "templates", "notify-hook.template.sh"),
			"utf-8",
		);

		expect(script).toContain(
			'curl -sX POST "$SUPERSET_HOST_AGENT_HOOK_URL" \\\n    --connect-timeout 2 --max-time 5',
		);
	});

	it("emits hidden UserPromptSubmit context when workspace fan-out is enabled", () => {
		const result = spawnSync(
			"bash",
			["-s", "--", '{"hook_event_name":"UserPromptSubmit"}'],
			{
				input: getNotifyScriptContent(),
				encoding: "utf8",
				env: {
					PATH: process.env.PATH,
					SUPERSET_AGENT_DELEGATION_MODE: "workspaces",
					SUPERSET_AGENT_ID: "codex",
					SUPERSET_WORKSPACE_ID: "workspace-123",
				},
			},
		);

		expect(result.status).toBe(0);
		const output = JSON.parse(result.stdout);
		expect(output).toMatchObject({
			hookSpecificOutput: {
				hookEventName: "UserPromptSubmit",
			},
		});
		expect(output.hookSpecificOutput.additionalContext).toContain(
			"superset workspaces create-subworkspace",
		);
		expect(output.hookSpecificOutput.additionalContext).toContain(
			'--parent "workspace-123"',
		);
		expect(output.hookSpecificOutput.additionalContext).toContain(
			'--agent "codex"',
		);
	});

	it("does not emit delegation context in native mode", () => {
		const result = spawnSync(
			"bash",
			["-s", "--", '{"hook_event_name":"UserPromptSubmit"}'],
			{
				input: getNotifyScriptContent(),
				encoding: "utf8",
				env: {
					PATH: process.env.PATH,
					SUPERSET_AGENT_DELEGATION_MODE: "native",
					SUPERSET_AGENT_ID: "codex",
					SUPERSET_WORKSPACE_ID: "workspace-123",
				},
			},
		);

		expect(result.status).toBe(0);
		expect(result.stdout).toBe("");
	});

	it("uses the host's current mode for an already-open terminal", () => {
		const fakeBinDir = mkdtempSync(
			path.join(tmpdir(), "superset-notify-hook-test-"),
		);
		try {
			writeFileSync(
				path.join(fakeBinDir, "curl"),
				`#!/bin/bash
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o) OUTPUT_FILE="$2"; shift 2 ;;
    *) shift ;;
  esac
done
printf '%s' '{"result":{"data":{"json":{"agentDelegationMode":"workspaces"}}}}' > "$OUTPUT_FILE"
printf '200'
`,
				{ mode: 0o755 },
			);

			const result = spawnSync(
				"bash",
				["-s", "--", '{"hook_event_name":"UserPromptSubmit"}'],
				{
					input: getNotifyScriptContent(),
					encoding: "utf8",
					env: {
						PATH: `${fakeBinDir}:${process.env.PATH}`,
						SUPERSET_AGENT_DELEGATION_MODE: "native",
						SUPERSET_AGENT_ID: "codex",
						SUPERSET_HOST_AGENT_HOOK_URL: "http://127.0.0.1/hook",
						SUPERSET_TERMINAL_ID: "terminal-123",
						SUPERSET_WORKSPACE_ID: "workspace-123",
					},
				},
			);

			expect(result.status).toBe(0);
			const output = JSON.parse(result.stdout);
			expect(output.hookSpecificOutput.additionalContext).toContain(
				'--parent "workspace-123"',
			);
		} finally {
			rmSync(fakeBinDir, { recursive: true, force: true });
		}
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
			'if [ -n "$SUPERSET_TAB_ID" ] || [ -n "$SESSION_ID" ] || [ -n "$SUPERSET_TERMINAL_ID" ]; then',
		);
		expect(script).toContain("/hook/complete");
		expect(script).toContain("terminalId=$SUPERSET_TERMINAL_ID");
		expect(script).toContain("SUPERSET_TAB_ID");
		expect(script).toContain("SUPERSET_PANE_ID");
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
