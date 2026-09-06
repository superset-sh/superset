import { afterEach, beforeEach, describe, expect, it } from "bun:test";
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
import {
	activeClaudeConfigDirPath,
	syncDefaultAccountPointer,
} from "./default-account.ts";

const db = {
	select: () => ({
		from: () => ({
			get: () => ({ defaultClaudeConfigDir: null, defaultCodexHome: null }),
		}),
	}),
	insert: () => ({
		values: () => ({ onConflictDoUpdate: () => ({ run: () => {} }) }),
	}),
} as unknown as HostDb;

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

	/** What provisionClaudeProfile leaves behind in a dir it has provisioned. */
	function markProvisioned(dir: string): void {
		writeFileSync(join(dir, ".superset-profile.json"), "{}");
	}

	it("provisions every profile dir it owns, not only the one the pointer names", async () => {
		const profile = join(home, "claude-work");
		const codexProfile = join(home, "codex-work");
		const activeDir = activeClaudeConfigDirPath();
		for (const dir of [profile, codexProfile, activeDir]) {
			mkdirSync(dir, { recursive: true });
		}
		markProvisioned(profile);
		markProvisioned(codexProfile);
		syncDefaultAccountPointer("claude", activeDir);
		syncDefaultAccountPointer("codex", null);

		const claudeDirs: string[] = [];
		const codexHomes: string[] = [];
		await provisionSelectedAccounts(db, {
			discoverClaudeDirs: async () => [profile],
			discoverCodexDirs: async () => [codexProfile],
			provisionClaude: async (dir) => {
				claudeDirs.push(dir);
			},
			provisionCodex: async (dir) => {
				codexHomes.push(dir);
			},
		});

		expect(claudeDirs.sort()).toEqual([activeDir, profile].sort());
		expect(codexHomes).toEqual([codexProfile]);
	});

	// Discovery answers "what logins exist here", which is wider than "what
	// Superset was handed". A ~/.claude-backup or a scratch copy has a
	// .claude.json and so is discovered, but provisioning it at boot would
	// move its sessions into the live home behind the user's back.
	it("leaves a discovered dir Superset has never provisioned alone", async () => {
		const untouched = join(home, "claude-backup");
		const untouchedCodex = join(home, "codex-backup");
		for (const dir of [untouched, untouchedCodex]) mkdirSync(dir);

		const claudeDirs: string[] = [];
		const codexHomes: string[] = [];
		await provisionSelectedAccounts(db, {
			discoverClaudeDirs: async () => [untouched],
			discoverCodexDirs: async () => [untouchedCodex],
			provisionClaude: async (dir) => {
				claudeDirs.push(dir);
			},
			provisionCodex: async (dir) => {
				codexHomes.push(dir);
			},
		});

		expect(claudeDirs).toEqual([]);
		expect(codexHomes).toEqual([]);
	});

	it("skips a profile dir that has vanished", async () => {
		const claudeDirs: string[] = [];
		await provisionSelectedAccounts(db, {
			discoverClaudeDirs: async () => [join(home, "gone")],
			discoverCodexDirs: async () => [],
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
