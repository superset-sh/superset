import { describe, expect, it } from "bun:test";
import { WRAPPER_MARKER } from "./agent-wrappers-common";
import {
	getKimiConfigTomlContent,
	getKimiWrapperScript,
	KIMI_HOOKS_MARKER_END,
	KIMI_HOOKS_MARKER_START,
	KIMI_MANAGED_HOOK_EVENTS,
} from "./agent-wrappers-kimi";
import { DESKTOP_AGENT_SETUP_TARGETS } from "./desktop-agent-capabilities";

describe("Kimi config.toml hooks", () => {
	it("adds every lifecycle hook needed for terminal status", () => {
		const output = getKimiConfigTomlContent("");

		for (const event of KIMI_MANAGED_HOOK_EVENTS) {
			expect(output).toContain(`event = "${event}"`);
		}
		expect(output.match(/\[\[hooks\]\]/g)).toHaveLength(
			KIMI_MANAGED_HOOK_EVENTS.length,
		);
		expect(output).toContain("SUPERSET_AGENT_ID=kimi");
		expect(output).toContain(KIMI_HOOKS_MARKER_START);
		expect(output).toContain(KIMI_HOOKS_MARKER_END);
	});

	it("preserves user config and hooks and is idempotent", () => {
		const userConfig = [
			'default_model = "kimi-code/kimi-for-coding"',
			"",
			"[[hooks]]",
			'event = "PreToolUse"',
			'matcher = "Bash"',
			'command = "node ~/.kimi-code/hooks/check-bash.mjs"',
			"",
		].join("\n");

		const once = getKimiConfigTomlContent(userConfig);
		const twice = getKimiConfigTomlContent(once);

		expect(once).toBe(twice);
		expect(once).toContain(userConfig.trim());
		expect(once.match(/event = "PreToolUse"/g)).toHaveLength(1);
		expect(once.match(/superset-managed-kimi-hooks/g)).toHaveLength(2);
	});

	it("replaces an existing managed block", () => {
		const oldBlock = [
			KIMI_HOOKS_MARKER_START,
			"[[hooks]]",
			'event = "Stop"',
			'command = "stale-command"',
			KIMI_HOOKS_MARKER_END,
		].join("\n");

		const output = getKimiConfigTomlContent(oldBlock);

		expect(output).not.toContain("stale-command");
		expect(output.match(/superset-managed-kimi-hooks/g)).toHaveLength(2);
		expect(output).toContain('event = "UserPromptSubmit"');
	});

	it("leaves an incomplete managed block untouched", () => {
		const partial = `${KIMI_HOOKS_MARKER_START}\n[[hooks]]\nevent = "Stop"\n`;

		expect(getKimiConfigTomlContent(partial)).toBe(partial);
	});
});

describe("Kimi agent setup", () => {
	it("registers Kimi hook and wrapper setup", () => {
		const target = DESKTOP_AGENT_SETUP_TARGETS.find(
			(candidate) => candidate.id === "kimi",
		);

		expect(target).toMatchObject({
			id: "kimi",
			setupActions: ["kimi-config-toml", "kimi-wrapper"],
			managedBinary: true,
		});
	});

	it("creates a pass-through wrapper with agent identity", () => {
		const script = getKimiWrapperScript();

		expect(script).toContain(WRAPPER_MARKER);
		expect(script).toContain('export SUPERSET_AGENT_ID="kimi"');
		expect(script).toContain('exec "$REAL_BIN" "$@"');
	});
});
