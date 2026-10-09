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

function resolveWithTwin(env: Record<string, string | undefined>): string {
	const script = `${buildDefaultAccountResolver(
		"CLAUDE_CONFIG_DIR",
		"default-claude-config-dir",
	)}printf "%s|%s" "\${CLAUDE_CONFIG_DIR:-<unset>}" "\${SUPERSET_DEFAULT_CLAUDE_CONFIG_DIR:-<unset>}"`;
	const cleanEnv: Record<string, string> = { PATH: process.env.PATH ?? "" };
	for (const [key, value] of Object.entries(env)) {
		if (value !== undefined) cleanEnv[key] = value;
	}
	return execFileSync("bash", ["-c", script], {
		env: cleanEnv,
		encoding: "utf-8",
	});
}

function resolveCodexWithTwin(env: Record<string, string | undefined>): string {
	const script = `${buildDefaultAccountResolver(
		"CODEX_HOME",
		"default-codex-home",
		"SUPERSET_AMBIENT_CODEX_HOME",
	)}printf "%s|%s" "\${CODEX_HOME:-<unset>}" "\${SUPERSET_DEFAULT_CODEX_HOME:-<unset>}"`;
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

	function writePin(home: string, value: string, org = "o1"): void {
		const dir = join(home, "state", "workspace-accounts", org, "w1");
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, "default-claude-config-dir"), value);
	}

	it("prefers the workspace pin over the host pointer", () => {
		const { home, profile } = makeHome(null);
		writeFileSync(join(home, "state", "default-claude-config-dir"), profile);
		const pinned = join(home, "pinned");
		mkdirSync(pinned);
		writePin(home, pinned);
		expect(
			resolve({
				SUPERSET_TERMINAL_ID: "t1",
				SUPERSET_HOME_DIR: home,
				SUPERSET_ORGANIZATION_ID: "o1",
				SUPERSET_WORKSPACE_ID: "w1",
			}),
		).toBe(pinned);
	});

	it("moves a terminal spawned on the host default onto a later pin", () => {
		const { home, profile } = makeHome(null);
		writeFileSync(join(home, "state", "default-claude-config-dir"), profile);
		const pinned = join(home, "pinned");
		mkdirSync(pinned);
		writePin(home, pinned);
		expect(
			resolve({
				SUPERSET_TERMINAL_ID: "t1",
				SUPERSET_HOME_DIR: home,
				SUPERSET_ORGANIZATION_ID: "o1",
				SUPERSET_WORKSPACE_ID: "w1",
				CLAUDE_CONFIG_DIR: profile,
				SUPERSET_DEFAULT_CLAUDE_CONFIG_DIR: profile,
			}),
		).toBe(pinned);
	});

	it("returns a terminal spawned pinned to the host default once unpinned", () => {
		const { home, profile } = makeHome(null);
		writeFileSync(join(home, "state", "default-claude-config-dir"), profile);
		const pinned = join(home, "pinned");
		mkdirSync(pinned);
		expect(
			resolve({
				SUPERSET_TERMINAL_ID: "t1",
				SUPERSET_HOME_DIR: home,
				SUPERSET_ORGANIZATION_ID: "o1",
				SUPERSET_WORKSPACE_ID: "w1",
				CLAUDE_CONFIG_DIR: pinned,
				SUPERSET_DEFAULT_CLAUDE_CONFIG_DIR: pinned,
			}),
		).toBe(profile);
	});

	it("reads an org-less terminal's pin from the unscoped dir", () => {
		const { home, profile } = makeHome(null);
		writeFileSync(join(home, "state", "default-claude-config-dir"), profile);
		const pinned = join(home, "pinned");
		mkdirSync(pinned);
		writePin(home, pinned, "_");
		expect(
			resolve({
				SUPERSET_TERMINAL_ID: "t1",
				SUPERSET_HOME_DIR: home,
				SUPERSET_WORKSPACE_ID: "w1",
			}),
		).toBe(pinned);
	});

	it("ignores another org's pin for the same workspace id", () => {
		const { home, profile } = makeHome(null);
		writeFileSync(join(home, "state", "default-claude-config-dir"), profile);
		const pinned = join(home, "pinned");
		mkdirSync(pinned);
		writePin(home, pinned, "o2");
		expect(
			resolve({
				SUPERSET_TERMINAL_ID: "t1",
				SUPERSET_HOME_DIR: home,
				SUPERSET_ORGANIZATION_ID: "o1",
				SUPERSET_WORKSPACE_ID: "w1",
			}),
		).toBe(profile);
	});

	it("keeps a workspace pinned to the system-default login unset", () => {
		const { home, profile } = makeHome(null);
		writeFileSync(join(home, "state", "default-claude-config-dir"), profile);
		writePin(home, "");
		expect(
			resolve({
				SUPERSET_TERMINAL_ID: "t1",
				SUPERSET_HOME_DIR: home,
				SUPERSET_ORGANIZATION_ID: "o1",
				SUPERSET_WORKSPACE_ID: "w1",
			}),
		).toBe("<unset>");
	});

	it("keeps an unset spawn value when told the pointers may be stale", () => {
		const { home, profile } = makeHome(null);
		writeFileSync(join(home, "state", "default-claude-config-dir"), profile);
		writePin(home, profile);
		expect(
			resolve({
				SUPERSET_TERMINAL_ID: "t1",
				SUPERSET_HOME_DIR: home,
				SUPERSET_ORGANIZATION_ID: "o1",
				SUPERSET_WORKSPACE_ID: "w1",
				SUPERSET_SKIP_ACCOUNT_RESOLVE: "1",
			}),
		).toBe("<unset>");
	});

	it("falls back to the host pointer when the pinned dir is gone", () => {
		const { home, profile } = makeHome(null);
		writeFileSync(join(home, "state", "default-claude-config-dir"), profile);
		const gone = join(home, "gone");
		writePin(home, gone);
		expect(
			resolve({
				SUPERSET_TERMINAL_ID: "t1",
				SUPERSET_HOME_DIR: home,
				SUPERSET_ORGANIZATION_ID: "o1",
				SUPERSET_WORKSPACE_ID: "w1",
				CLAUDE_CONFIG_DIR: gone,
				SUPERSET_DEFAULT_CLAUDE_CONFIG_DIR: gone,
			}),
		).toBe(profile);
	});

	it("updates the injection marker when it adopts a new pointer", () => {
		const { home, profile } = makeHome(null);
		writeFileSync(join(home, "state", "default-claude-config-dir"), profile);
		expect(
			resolveWithTwin({
				SUPERSET_TERMINAL_ID: "t1",
				SUPERSET_HOME_DIR: home,
				CLAUDE_CONFIG_DIR: "/tmp/old-spawn-time-default",
				SUPERSET_DEFAULT_CLAUDE_CONFIG_DIR: "/tmp/old-spawn-time-default",
			}),
		).toBe(`${profile}|${profile}`);
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

	it("clears the injection marker with the injected value", () => {
		const { home, profile } = makeHome("");
		expect(
			resolveWithTwin({
				SUPERSET_TERMINAL_ID: "t1",
				SUPERSET_HOME_DIR: home,
				CLAUDE_CONFIG_DIR: profile,
				SUPERSET_DEFAULT_CLAUDE_CONFIG_DIR: profile,
			}),
		).toBe("<unset>|<unset>");
	});

	it("restores the ambient Codex home when switching to system default", () => {
		const { home, profile } = makeHome(null);
		const ambient = join(home, "custom-codex");
		writeFileSync(join(home, "state", "default-codex-home"), "");
		expect(
			resolveCodexWithTwin({
				SUPERSET_TERMINAL_ID: "t1",
				SUPERSET_HOME_DIR: home,
				CODEX_HOME: profile,
				SUPERSET_DEFAULT_CODEX_HOME: profile,
				SUPERSET_AMBIENT_CODEX_HOME: ambient,
			}),
		).toBe(`${ambient}|${ambient}`);
	});

	it("follows a Codex system-login pin to the ambient home", () => {
		const { home, profile } = makeHome(null);
		const ambient = join(home, "custom-codex");
		writeFileSync(join(home, "state", "default-codex-home"), profile);
		const dir = join(home, "state", "workspace-accounts", "o1", "w1");
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, "default-codex-home"), "");
		expect(
			resolveCodexWithTwin({
				SUPERSET_TERMINAL_ID: "t1",
				SUPERSET_HOME_DIR: home,
				SUPERSET_ORGANIZATION_ID: "o1",
				SUPERSET_WORKSPACE_ID: "w1",
				CODEX_HOME: profile,
				SUPERSET_DEFAULT_CODEX_HOME: profile,
				SUPERSET_AMBIENT_CODEX_HOME: ambient,
			}),
		).toBe(`${ambient}|${ambient}`);
	});

	it("adopts a later Codex profile over an injected ambient default", () => {
		const { home, profile } = makeHome(null);
		const ambient = join(home, "custom-codex");
		writeFileSync(join(home, "state", "default-codex-home"), profile);
		expect(
			resolveCodexWithTwin({
				SUPERSET_TERMINAL_ID: "t1",
				SUPERSET_HOME_DIR: home,
				CODEX_HOME: ambient,
				SUPERSET_DEFAULT_CODEX_HOME: ambient,
				SUPERSET_AMBIENT_CODEX_HOME: ambient,
			}),
		).toBe(`${profile}|${profile}`);
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
