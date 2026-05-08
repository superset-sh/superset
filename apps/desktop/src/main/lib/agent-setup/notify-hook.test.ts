import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("getNotifyScriptContent", () => {
	it("emits the v2 host-service payload with full agent identity", () => {
		const script = readFileSync(
			path.join(import.meta.dir, "templates", "notify-hook.template.sh"),
			"utf-8",
		);

		expect(script).toContain('HOOK_SESSION_ID=$(echo "$INPUT"');
		expect(script).toContain(
			'PAYLOAD="{\\"json\\":{\\"terminalId\\":\\"$(json_escape "$SUPERSET_TERMINAL_ID")\\",\\"eventType\\":\\"$(json_escape "$EVENT_TYPE")\\",\\"agent\\":{\\"agentId\\":\\"$(json_escape "$SUPERSET_AGENT_ID")\\",\\"sessionId\\":\\"$(json_escape "$HOOK_SESSION_ID")\\"}}}"',
		);
		expect(script).toContain(
			"event=$EVENT_TYPE terminalId=$SUPERSET_TERMINAL_ID agentId=$SUPERSET_AGENT_ID hookSessionId=$HOOK_SESSION_ID workspaceId=$SUPERSET_WORKSPACE_ID",
		);
	});

	it("gives the v2 host-service hook enough time to deliver", () => {
		const script = readFileSync(
			path.join(import.meta.dir, "templates", "notify-hook.template.sh"),
			"utf-8",
		);

		expect(script).toContain(
			'curl -sX POST "$SUPERSET_HOST_AGENT_HOOK_URL" \\\n  --connect-timeout 2 --max-time 5',
		);
	});

	it("exits early outside a v2 Superset terminal", () => {
		const script = readFileSync(
			path.join(import.meta.dir, "templates", "notify-hook.template.sh"),
			"utf-8",
		);

		expect(script).toContain('[ -z "$SUPERSET_TERMINAL_ID" ] && exit 0');
		expect(script).toContain(
			'[ -z "$SUPERSET_HOST_AGENT_HOOK_URL" ] && exit 0',
		);
		// No v1 fallback path should remain — no /hook/complete, no SUPERSET_TAB_ID,
		// no SUPERSET_PANE_ID. v1 is sunset.
		expect(script).not.toContain("/hook/complete");
		expect(script).not.toContain("SUPERSET_TAB_ID");
		expect(script).not.toContain("SUPERSET_PANE_ID");
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
		it(`${template} posts the v2 agent identity payload and has no v1 fallback`, () => {
			const script = readFileSync(
				path.join(import.meta.dir, "templates", template),
				"utf-8",
			);
			expect(script).toContain(expectedV2Payload);
			expect(script).toContain('curl -sX POST "$SUPERSET_HOST_AGENT_HOOK_URL"');
			expect(script).toContain('[ -z "$SUPERSET_TERMINAL_ID" ] && exit 0');
			expect(script).not.toContain("/hook/complete");
			expect(script).not.toContain("SUPERSET_TAB_ID");
			expect(script).not.toContain("SUPERSET_PANE_ID");
		});
	}
});
