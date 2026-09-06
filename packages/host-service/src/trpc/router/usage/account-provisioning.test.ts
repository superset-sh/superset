import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HostDb } from "../../../db/index.ts";
import {
	ensureActiveClaudeDir,
	provisionSelectedAccounts,
} from "./account-provisioning.ts";
import { syncDefaultAccountPointer } from "./default-account.ts";
import * as profiles from "./profiles.ts";

function dbWith(
	defaultClaudeConfigDir: string | null,
	defaultCodexHome: string | null,
): HostDb {
	return {
		select: () => ({
			from: () => ({
				get: () => ({ defaultClaudeConfigDir, defaultCodexHome }),
			}),
		}),
		insert: () => ({
			values: () => ({ onConflictDoUpdate: () => ({ run: () => {} }) }),
		}),
	} as unknown as HostDb;
}

/**
 * KTD2: the pointer names the Superset-owned active dir once a swap has run,
 * so boot provisioning can no longer take it for "the account to provision" —
 * session sharing has to keep reaching every profile dir Superset owns,
 * including ones added after the last switch. It must not reach further than
 * that: provisioning moves a dir's session tree into ~/.claude and rewrites
 * its settings, so doing it to a dir the user never handed over destroys the
 * isolation that dir existed for.
 */
describe("provisionSelectedAccounts", () => {
	let home: string;
	let previousHome: string | undefined;

	beforeEach(() => {
		previousHome = process.env.SUPERSET_HOME_DIR;
		home = mkdtempSync(join(tmpdir(), "superset-provision-accounts-"));
		process.env.SUPERSET_HOME_DIR = join(home, ".superset");
	});

	afterEach(() => {
		if (previousHome === undefined) delete process.env.SUPERSET_HOME_DIR;
		else process.env.SUPERSET_HOME_DIR = previousHome;
		rmSync(home, { recursive: true, force: true });
	});

	// Provisioning moves a dir's session tree into ~/.claude and rewrites its
	// settings, so the boot pass must reach only the account Superset was
	// handed. Everything else is provisioned when it is selected.
	it("provisions the pointer selection", async () => {
		const selected = join(home, "claude-work");
		const codexSelected = join(home, "codex-work");
		for (const dir of [selected, codexSelected]) mkdirSync(dir);
		syncDefaultAccountPointer("claude", selected);
		syncDefaultAccountPointer("codex", codexSelected);

		const claudeDirs: string[] = [];
		const codexHomes: string[] = [];
		await provisionSelectedAccounts(dbWith(selected, codexSelected), {
			provisionClaude: async (dir) => {
				claudeDirs.push(dir);
			},
			provisionCodex: async (dir) => {
				codexHomes.push(dir);
			},
		});

		expect(claudeDirs).toEqual([selected]);
		expect(codexHomes).toEqual([codexSelected]);
	});

	// The contract is that discovery is never consulted here at all —
	// provisioning moves a dir's session tree into ~/.claude, so it must reach
	// only the account Superset was handed. Asserting on a fixture directory
	// cannot pin that: discovery scans the real homedir(), not the test's temp
	// root, so such a test passes even with the fan-out restored. Spy on the
	// module instead.
	it("never consults discovery", async () => {
		const selected = join(home, "claude-work");
		mkdirSync(selected);
		syncDefaultAccountPointer("claude", selected);
		const claudeSpy = spyOn(profiles, "discoverClaudeProfiles");
		const codexSpy = spyOn(profiles, "discoverCodexHomes");

		try {
			await provisionSelectedAccounts(dbWith(selected, null), {
				provisionClaude: async () => {},
				provisionCodex: async () => {},
			});

			expect(claudeSpy).not.toHaveBeenCalled();
			expect(codexSpy).not.toHaveBeenCalled();
		} finally {
			claudeSpy.mockRestore();
			codexSpy.mockRestore();
		}
	});

	it("skips a selection that has vanished", async () => {
		const gone = join(home, "gone");
		syncDefaultAccountPointer("claude", gone);

		const claudeDirs: string[] = [];
		await provisionSelectedAccounts(dbWith(gone, null), {
			provisionClaude: async (dir) => {
				claudeDirs.push(dir);
			},
			provisionCodex: async () => {},
		});

		expect(claudeDirs).toEqual([]);
	});
});

/**
 * The dir is published to the pointer the moment the first switch creates it,
 * so whatever it holds is what the next launch reads.
 */
describe("ensureActiveClaudeDir", () => {
	let home: string;
	let previousHome: string | undefined;

	beforeEach(() => {
		previousHome = process.env.SUPERSET_HOME_DIR;
		home = mkdtempSync(join(tmpdir(), "superset-active-dir-"));
		process.env.SUPERSET_HOME_DIR = join(home, ".superset");
	});

	afterEach(() => {
		if (previousHome === undefined) delete process.env.SUPERSET_HOME_DIR;
		else process.env.SUPERSET_HOME_DIR = previousHome;
		rmSync(home, { recursive: true, force: true });
	});

	// The first activation passes no seedLogin and the engine seeds identity
	// afterwards, so provisioning would otherwise merge into nothing and the
	// flag would be absent — opening the first-boot wizard, where a stray
	// Enter starts a login that rebinds the profile.
	it("states hasCompletedOnboarding on a dir created without a seed", async () => {
		const dir = await ensureActiveClaudeDir({ provision: async () => {} });

		expect(existsSync(join(dir, ".claude.json"))).toBe(true);
		const state = JSON.parse(readFileSync(join(dir, ".claude.json"), "utf-8"));
		expect(state.hasCompletedOnboarding).toBe(true);
	});

	it("leaves a seeded state file's identity intact", async () => {
		const dir = await ensureActiveClaudeDir({
			provision: async () => {},
			seedLogin: async (activeDir) => {
				writeFileSync(
					join(activeDir, ".claude.json"),
					JSON.stringify({ oauthAccount: { accountUuid: "uuid-a" } }),
				);
			},
		});

		const state = JSON.parse(readFileSync(join(dir, ".claude.json"), "utf-8"));
		expect(state.oauthAccount.accountUuid).toBe("uuid-a");
	});
});
