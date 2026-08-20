import { describe, expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildDefaultAccountResolver } from "./agent-wrappers-common";

/** Runs the resolver block under bash and returns the resulting env var. */
function resolve(env: Record<string, string | undefined>): string {
	const script = `${buildDefaultAccountResolver(
		"CLAUDE_CONFIG_DIR",
		"default-claude-config-dir",
	)}printf "%s" "\${CLAUDE_CONFIG_DIR:-<unset>}"`;
	const cleanEnv: Record<string, string> = { PATH: process.env.PATH ?? "" };
	for (const [key, value] of Object.entries(env)) {
		if (value !== undefined) cleanEnv[key] = value;
	}
	return execFileSync("bash", ["-c", script], {
		env: cleanEnv,
		encoding: "utf-8",
	});
}

function makeHome(pointer: string | null): {
	home: string;
	profile: string;
} {
	const home = mkdtempSync(join(tmpdir(), "superset-resolver-"));
	const profile = join(home, "profile");
	mkdirSync(join(home, "state"), { recursive: true });
	mkdirSync(profile);
	if (pointer !== null) {
		writeFileSync(join(home, "state", "default-claude-config-dir"), pointer);
	}
	return { home, profile };
}

describe("buildDefaultAccountResolver", () => {
	it("adopts the pointer in a Superset terminal with no spawn-time value", () => {
		const { home, profile } = makeHome("");
		writeFileSync(join(home, "state", "default-claude-config-dir"), profile);
		expect(
			resolve({ SUPERSET_TERMINAL_ID: "t1", SUPERSET_HOME_DIR: home }),
		).toBe(profile);
	});

	it("re-resolves over a stale Superset-injected value", () => {
		const { home, profile } = makeHome(null);
		writeFileSync(join(home, "state", "default-claude-config-dir"), profile);
		expect(
			resolve({
				SUPERSET_TERMINAL_ID: "t1",
				SUPERSET_HOME_DIR: home,
				CLAUDE_CONFIG_DIR: "/tmp/old-spawn-time-default",
				SUPERSET_DEFAULT_CLAUDE_CONFIG_DIR: "/tmp/old-spawn-time-default",
			}),
		).toBe(profile);
	});

	it("clears a stale injected value when the pointer says system default", () => {
		const { home, profile } = makeHome("");
		expect(
			resolve({
				SUPERSET_TERMINAL_ID: "t1",
				SUPERSET_HOME_DIR: home,
				CLAUDE_CONFIG_DIR: profile,
				SUPERSET_DEFAULT_CLAUDE_CONFIG_DIR: profile,
			}),
		).toBe("<unset>");
	});

	it("never overrides a value the user exported by hand", () => {
		const { home, profile } = makeHome(null);
		writeFileSync(join(home, "state", "default-claude-config-dir"), profile);
		expect(
			resolve({
				SUPERSET_TERMINAL_ID: "t1",
				SUPERSET_HOME_DIR: home,
				CLAUDE_CONFIG_DIR: "/tmp/user-picked-this",
				SUPERSET_DEFAULT_CLAUDE_CONFIG_DIR: profile,
			}),
		).toBe("/tmp/user-picked-this");
	});

	it("does nothing outside Superset terminals", () => {
		const { home, profile } = makeHome(null);
		writeFileSync(join(home, "state", "default-claude-config-dir"), profile);
		expect(resolve({ SUPERSET_HOME_DIR: home })).toBe("<unset>");
	});

	it("does nothing when the pointer file is missing (older host build)", () => {
		const { home } = makeHome(null);
		expect(
			resolve({
				SUPERSET_TERMINAL_ID: "t1",
				SUPERSET_HOME_DIR: home,
				CLAUDE_CONFIG_DIR: "/tmp/spawn-time",
				SUPERSET_DEFAULT_CLAUDE_CONFIG_DIR: "/tmp/spawn-time",
			}),
		).toBe("/tmp/spawn-time");
	});

	it("ignores a pointer at a vanished dir instead of booting signed out", () => {
		const { home } = makeHome("/tmp/deleted-profile-dir-that-is-gone");
		expect(
			resolve({ SUPERSET_TERMINAL_ID: "t1", SUPERSET_HOME_DIR: home }),
		).toBe("<unset>");
	});
});
