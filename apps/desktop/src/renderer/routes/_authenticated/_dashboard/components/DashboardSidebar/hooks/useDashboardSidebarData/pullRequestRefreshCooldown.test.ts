import { describe, expect, test } from "bun:test";
import {
	createPullRequestRefreshGate,
	PULL_REQUEST_REFRESH_COOLDOWN_MS,
} from "./pullRequestRefreshCooldown";

describe("createPullRequestRefreshGate", () => {
	test("allows the first refresh for a workspace", () => {
		const gate = createPullRequestRefreshGate();
		expect(gate.shouldRefresh("ws-1", 1_000)).toBe(true);
	});

	test("rejects a second refresh inside the cool-down window", () => {
		const gate = createPullRequestRefreshGate();
		expect(gate.shouldRefresh("ws-1", 1_000)).toBe(true);
		expect(
			gate.shouldRefresh("ws-1", 1_000 + PULL_REQUEST_REFRESH_COOLDOWN_MS - 1),
		).toBe(false);
	});

	test("allows a refresh once the cool-down has elapsed", () => {
		const gate = createPullRequestRefreshGate();
		expect(gate.shouldRefresh("ws-1", 1_000)).toBe(true);
		expect(
			gate.shouldRefresh("ws-1", 1_000 + PULL_REQUEST_REFRESH_COOLDOWN_MS),
		).toBe(true);
	});

	test("tracks workspaces independently", () => {
		const gate = createPullRequestRefreshGate();
		expect(gate.shouldRefresh("ws-1", 1_000)).toBe(true);
		expect(gate.shouldRefresh("ws-2", 1_001)).toBe(true);
		expect(gate.shouldRefresh("ws-1", 1_002)).toBe(false);
	});

	test("a rejected attempt does not extend the window", () => {
		const gate = createPullRequestRefreshGate(1_000);
		expect(gate.shouldRefresh("ws-1", 0)).toBe(true);
		expect(gate.shouldRefresh("ws-1", 999)).toBe(false);
		expect(gate.shouldRefresh("ws-1", 1_000)).toBe(true);
	});

	test("an allowed attempt restarts the window", () => {
		const gate = createPullRequestRefreshGate(1_000);
		expect(gate.shouldRefresh("ws-1", 0)).toBe(true);
		expect(gate.shouldRefresh("ws-1", 1_500)).toBe(true);
		expect(gate.shouldRefresh("ws-1", 2_400)).toBe(false);
	});
});
