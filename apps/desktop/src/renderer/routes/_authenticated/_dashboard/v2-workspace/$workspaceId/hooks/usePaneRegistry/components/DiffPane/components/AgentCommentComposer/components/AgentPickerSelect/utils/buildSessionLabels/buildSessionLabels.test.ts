import { describe, expect, it } from "bun:test";
import type { TerminalAgentBinding } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { buildSessionLabels, formatSessionName } from "./buildSessionLabels";

function binding(
	terminalId: string,
	agentId: string,
	lastEventAt = 0,
): TerminalAgentBinding {
	return {
		terminalId,
		workspaceId: "ws-1",
		agentId: agentId as TerminalAgentBinding["agentId"],
		startedAt: 0,
		lastEventAt,
		lastEventType: "message",
	};
}

describe("buildSessionLabels", () => {
	// Reproduces the issue: several sessions of the same agent are
	// indistinguishable by agent name alone — the only thing the picker
	// historically leaned on for the headline was `agentId`.
	it("documents the same-agent ambiguity the issue reports", () => {
		const sessions = [
			binding("a1b2c3d4", "claude"),
			binding("e5f6a7b8", "claude"),
		];

		const headlineByAgentNameOnly = new Set(sessions.map((s) => s.agentId));
		// Two distinct sessions collapse to a single human-readable headline.
		expect(headlineByAgentNameOnly.size).toBe(1);
	});

	it("assigns distinct ordinals to same-agent sessions", () => {
		const sessions = [
			binding("a1b2c3d4", "claude"),
			binding("e5f6a7b8", "claude"),
		];

		const labels = buildSessionLabels(sessions);

		const first = labels.get("a1b2c3d4");
		const second = labels.get("e5f6a7b8");
		expect(first?.ordinal).toBe(1);
		expect(second?.ordinal).toBe(2);
		expect(first?.sameAgentCount).toBe(2);

		// The fix makes the human-readable names unique again.
		const names = new Set(
			[...labels.values()].map((label) => formatSessionName(label)),
		);
		expect(names.size).toBe(2);
		expect([...names]).toEqual(["claude #1", "claude #2"]);
	});

	it("omits the ordinal when an agent has a single session", () => {
		const labels = buildSessionLabels([
			binding("a1b2c3d4", "claude"),
			binding("e5f6a7b8", "codex"),
		]);

		const claude = labels.get("a1b2c3d4");
		const codex = labels.get("e5f6a7b8");
		expect(claude?.ordinal).toBeNull();
		expect(codex?.ordinal).toBeNull();
		expect(claude && formatSessionName(claude)).toBe("claude");
		expect(codex && formatSessionName(codex)).toBe("codex");
	});

	it("numbers ordinals per agent following input (recency) order", () => {
		// Composer passes sessions most-recent-first, so #1 is most recent.
		const sessions = [
			binding("claude-newer", "claude", 200),
			binding("codex-only", "codex", 150),
			binding("claude-older", "claude", 100),
		];

		const labels = buildSessionLabels(sessions);
		expect(labels.get("claude-newer")?.ordinal).toBe(1);
		expect(labels.get("claude-older")?.ordinal).toBe(2);
		expect(labels.get("codex-only")?.ordinal).toBeNull();
	});

	it("keeps a stable short id as a secondary hint", () => {
		const labels = buildSessionLabels([binding("abcdef0123456", "claude")]);
		expect(labels.get("abcdef0123456")?.shortId).toBe("abcdef");
	});

	it("returns an empty map for no sessions", () => {
		expect(buildSessionLabels([]).size).toBe(0);
	});
});
