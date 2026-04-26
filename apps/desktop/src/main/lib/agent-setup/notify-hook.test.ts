import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("getNotifyScriptContent", () => {
	it("keeps v1 fallback session ids out of the v2 host-service payload", () => {
		const script = readFileSync(
			path.join(import.meta.dir, "templates", "notify-hook.template.sh"),
			"utf-8",
		);

		expect(script).toContain('RESOURCE_ID=$(echo "$INPUT"');
		expect(script).toContain(
			"SESSION_ID=" + "\u0024{RESOURCE_ID:-$HOOK_SESSION_ID}",
		);
		expect(script).toContain(
			'PAYLOAD="{\\"json\\":{\\"terminalId\\":\\"$(json_escape "$SUPERSET_TERMINAL_ID")\\",\\"eventType\\":\\"$(json_escape "$EVENT_TYPE")\\"}}"',
		);
		expect(script).toContain('--data-urlencode "resourceId=$RESOURCE_ID"');
		expect(script).toContain(
			'--data-urlencode "hookSessionId=$HOOK_SESSION_ID"',
		);
		expect(script).toContain(
			"event=$EVENT_TYPE terminalId=$SUPERSET_TERMINAL_ID sessionId=$SESSION_ID hookSessionId=$HOOK_SESSION_ID resourceId=$RESOURCE_ID",
		);
	});

	it("gives the v2 host-service hook enough time to avoid false fallback", () => {
		const script = readFileSync(
			path.join(import.meta.dir, "templates", "notify-hook.template.sh"),
			"utf-8",
		);

		expect(script).toContain(
			'curl -sX POST "$SUPERSET_HOST_AGENT_HOOK_URL" \\\n    --connect-timeout 2 --max-time 5',
		);
	});

	it("keeps the legacy v1 fallback path when no host-service hook URL exists", () => {
		const script = readFileSync(
			path.join(import.meta.dir, "templates", "notify-hook.template.sh"),
			"utf-8",
		);

		expect(script).toContain('if [ -n "$SUPERSET_HOST_AGENT_HOOK_URL" ]; then');
		expect(script).toContain(
			'[ -z "$SUPERSET_TAB_ID" ] && [ -z "$SESSION_ID" ] && exit 0',
		);
		expect(script).toContain(
			'curl -sG "http://127.0.0.1:' +
				"$" +
				"{SUPERSET_PORT:-{{DEFAULT_PORT}}}" +
				'/hook/complete"',
		);
		expect(script).toContain('--data-urlencode "paneId=$SUPERSET_PANE_ID"');
		expect(script).toContain('--data-urlencode "tabId=$SUPERSET_TAB_ID"');
		expect(script).toContain('--data-urlencode "sessionId=$SESSION_ID"');
	});
});
