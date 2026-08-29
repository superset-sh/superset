import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
} from "node:fs";
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

	it("keeps the first legacy selection when org migrations race", () => {
		const first = "/Users/kietho/.claude-work";
		const second = "/Users/kietho/.claude-personal";

		syncDefaultAccountPointers(mockDb(first));
		syncDefaultAccountPointers(mockDb(second));

		expect(getDefaultAccountSelections(mockDb(second)).claudeConfigDir).toBe(
			first,
		);
	});

	it("propagates pointer I/O failures instead of treating them as absent", () => {
		const pointerPath = join(home, "state", "default-claude-config-dir");
		mkdirSync(pointerPath, { recursive: true });

		expect(() =>
			getDefaultAccountSelections(mockDb("/Users/kietho/.claude-work")),
		).toThrow();
	});
});
