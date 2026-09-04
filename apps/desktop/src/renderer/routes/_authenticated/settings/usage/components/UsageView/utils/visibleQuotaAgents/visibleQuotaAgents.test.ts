import { describe, expect, it } from "bun:test";
import { visibleQuotaAgents } from "./visibleQuotaAgents";

describe("visibleQuotaAgents", () => {
	it("keeps the managed agents when the host has no logins at all", () => {
		expect(visibleQuotaAgents([])).toEqual(["claude", "codex"]);
	});

	it("keeps Claude Code beside a lone Codex login so Add account stays reachable", () => {
		expect(visibleQuotaAgents([{ agent: "codex" }])).toEqual([
			"claude",
			"codex",
		]);
	});

	it("hides Grok and Antigravity while neither has a login", () => {
		expect(visibleQuotaAgents([{ agent: "claude" }])).toEqual([
			"claude",
			"codex",
		]);
	});

	it("shows Grok once it has a login", () => {
		expect(visibleQuotaAgents([{ agent: "grok" }])).toEqual([
			"claude",
			"codex",
			"grok",
		]);
	});

	it("shows Antigravity once it has a login", () => {
		expect(visibleQuotaAgents([{ agent: "agy" }, { agent: "claude" }])).toEqual(
			["claude", "codex", "agy"],
		);
	});

	it("orders every section by display order, not by account order", () => {
		expect(
			visibleQuotaAgents([
				{ agent: "agy" },
				{ agent: "grok" },
				{ agent: "codex" },
			]),
		).toEqual(["claude", "codex", "grok", "agy"]);
	});
});
