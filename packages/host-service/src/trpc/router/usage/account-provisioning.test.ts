import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HostDb } from "../../../db/index.ts";
import { provisionSelectedAccounts } from "./account-provisioning.ts";
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
 * session sharing has to keep reaching every profile dir, including ones
 * added after the last switch.
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

	it("provisions every profile dir, not only the one the pointer names", async () => {
		const profile = join(home, "claude-work");
		const codexProfile = join(home, "codex-work");
		const activeDir = activeClaudeConfigDirPath();
		for (const dir of [profile, codexProfile, activeDir]) {
			mkdirSync(dir, { recursive: true });
		}
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
