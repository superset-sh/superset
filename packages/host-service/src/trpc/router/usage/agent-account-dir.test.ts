import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HostDb } from "../../../db/index.ts";
import { resolveAgentAccountDir } from "./agent-account-dir.ts";

function mockDb(selection: {
	claude?: string | null;
	codex?: string | null;
}): HostDb {
	return {
		select: () => ({
			from: () => ({
				get: () => ({
					defaultClaudeConfigDir: selection.claude ?? null,
					defaultCodexHome: selection.codex ?? null,
				}),
			}),
		}),
	} as unknown as HostDb;
}

describe("resolveAgentAccountDir", () => {
	let home: string;
	let profile: string;
	let exported: string;
	const previous: Record<string, string | undefined> = {};

	beforeEach(() => {
		for (const key of [
			"SUPERSET_HOME_DIR",
			"CODEX_HOME",
			"SUPERSET_DEFAULT_CODEX_HOME",
			"SUPERSET_AMBIENT_CODEX_HOME",
		]) {
			previous[key] = process.env[key];
			delete process.env[key];
		}
		home = mkdtempSync(join(tmpdir(), "agent-account-dir-"));
		process.env.SUPERSET_HOME_DIR = join(home, "superset");
		profile = join(home, "profile");
		exported = join(home, "exported");
		mkdirSync(profile, { recursive: true });
		mkdirSync(exported, { recursive: true });
	});

	afterEach(() => {
		for (const [key, value] of Object.entries(previous)) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
		rmSync(home, { recursive: true, force: true });
	});

	it("reports the Superset-selected Claude profile as managed", () => {
		expect(
			resolveAgentAccountDir(mockDb({ claude: profile }), {
				family: "claude",
			}),
		).toEqual({ configDir: profile, managed: true });
	});

	it("reports no selection as the managed system-default home", () => {
		expect(
			resolveAgentAccountDir(mockDb({ claude: null }), { family: "claude" }),
		).toEqual({ configDir: null, managed: true });
	});

	it("sees a shell-exported Claude directory when no account is selected", () => {
		expect(
			resolveAgentAccountDir(mockDb({}), {
				family: "claude",
				shellEnv: { CLAUDE_CONFIG_DIR: exported },
			}),
		).toEqual({ configDir: exported, managed: false });
	});

	for (const family of ["claude", "codex"] as const) {
		it(`keeps a ${family} shell pin unmanaged after the pointer changes`, () => {
			const key = family === "claude" ? "CLAUDE_CONFIG_DIR" : "CODEX_HOME";
			expect(
				resolveAgentAccountDir(mockDb({ [family]: profile }), {
					family,
					shellEnv: { [key]: exported },
				}),
			).toEqual({ configDir: profile, managed: false });
			expect(
				resolveAgentAccountDir(mockDb({ [family]: profile }), {
					family,
					shellEnv: { [key]: exported },
					env: { [key]: exported },
				}),
			).toEqual({ configDir: exported, managed: false });
		});
	}

	it("does not treat an empty shell directory as a pin", () => {
		expect(
			resolveAgentAccountDir(mockDb({ claude: profile }), {
				family: "claude",
				shellEnv: { CLAUDE_CONFIG_DIR: "" },
			}),
		).toEqual({ configDir: profile, managed: true });
	});

	// A hand-pinned dir that happens to equal today's selection is still
	// hand-pinned: the config env wins at relaunch, so calling it managed
	// would have the engine kill the session and resume it on the same
	// account it was just switched away from, while telling the user it moved.
	it("treats a per-agent CLAUDE_CONFIG_DIR equal to the selection as unmanaged", () => {
		expect(
			resolveAgentAccountDir(mockDb({ claude: profile }), {
				family: "claude",
				env: { CLAUDE_CONFIG_DIR: profile },
			}),
		).toEqual({ configDir: profile, managed: false });
	});

	it("treats a user-exported CLAUDE_CONFIG_DIR as unmanaged", () => {
		expect(
			resolveAgentAccountDir(mockDb({ claude: profile }), {
				family: "claude",
				env: { CLAUDE_CONFIG_DIR: exported },
			}),
		).toEqual({ configDir: exported, managed: false });
	});

	it("treats a CLAUDE_CONFIG_DIR with no Superset twin as unmanaged", () => {
		expect(
			resolveAgentAccountDir(mockDb({ claude: null }), {
				family: "claude",
				env: { CLAUDE_CONFIG_DIR: exported },
			}),
		).toEqual({ configDir: exported, managed: false });
	});

	// The twin is Superset's own marker, injected beside its selection. A
	// config's env carrying one is a user pinning the pair by hand — read as
	// Superset's own, it would hand the engine a session it must not restart.
	it("treats a config that supplies the Superset twin itself as pinned", () => {
		expect(
			resolveAgentAccountDir(mockDb({ claude: profile }), {
				family: "claude",
				env: {
					CLAUDE_CONFIG_DIR: exported,
					SUPERSET_DEFAULT_CLAUDE_CONFIG_DIR: exported,
				},
			}),
		).toEqual({ configDir: exported, managed: false });
	});

	it("classifies Codex homes the same way", () => {
		const selected = resolveAgentAccountDir(mockDb({ codex: profile }), {
			family: "codex",
		});
		expect(selected).toEqual({ configDir: profile, managed: true });

		expect(
			resolveAgentAccountDir(mockDb({ codex: profile }), {
				family: "codex",
				env: { CODEX_HOME: exported },
			}),
		).toEqual({ configDir: exported, managed: false });

		// Codex never reports a null configDir, so the pin and the selection
		// are compared as two concrete paths — the case that used to read as
		// managed and get the session restarted onto the home it was already on.
		expect(
			resolveAgentAccountDir(mockDb({ codex: profile }), {
				family: "codex",
				env: { CODEX_HOME: profile },
			}),
		).toEqual({ configDir: profile, managed: false });
	});

	it("ignores a selection whose profile dir has vanished", () => {
		const gone = join(home, "deleted-profile");
		expect(
			resolveAgentAccountDir(mockDb({ claude: gone }), { family: "claude" }),
		).toEqual({ configDir: null, managed: true });
	});
});
