import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HostDb } from "../../../db/index.ts";
import {
	getDefaultAccountSelections,
	syncDefaultAccountPointer,
	syncDefaultAccountPointers,
} from "./default-account.ts";

function mockDb(defaultClaudeConfigDir: string | null | undefined): HostDb {
	return {
		select: () => ({
			from: () => ({
				get: () =>
					defaultClaudeConfigDir === undefined
						? undefined
						: { defaultClaudeConfigDir, defaultCodexHome: null },
			}),
		}),
	} as unknown as HostDb;
}

describe("host-wide default account pointers", () => {
	let home: string;
	let previousHome: string | undefined;

	beforeEach(() => {
		previousHome = process.env.SUPERSET_HOME_DIR;
		home = mkdtempSync(join(tmpdir(), "superset-default-account-"));
		process.env.SUPERSET_HOME_DIR = home;
	});

	afterEach(() => {
		if (previousHome === undefined) delete process.env.SUPERSET_HOME_DIR;
		else process.env.SUPERSET_HOME_DIR = previousHome;
		rmSync(home, { recursive: true, force: true });
	});

	it("does not let an empty second org reset a selected account at boot", () => {
		const selected = "/Users/kietho/.claude-work";
		syncDefaultAccountPointers(mockDb(selected));
		syncDefaultAccountPointers(mockDb(undefined));

		expect(getDefaultAccountSelections(mockDb(undefined)).claudeConfigDir).toBe(
			selected,
		);
		expect(
			readFileSync(join(home, "state", "default-claude-config-dir"), "utf8"),
		).toBe(selected);
	});

	it("treats an existing empty pointer as an explicit system-default choice", () => {
		const selected = "/Users/kietho/.claude-work";
		const db = mockDb(selected);
		syncDefaultAccountPointer("claude", null);

		expect(getDefaultAccountSelections(db).claudeConfigDir).toBeNull();
		expect(existsSync(join(home, "state", "default-claude-config-dir"))).toBe(
			true,
		);
	});
});
