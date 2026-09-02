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
	resolveDefaultAccountEnv,
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
	let previousCodexHome: string | undefined;
	let previousInjectedCodexHome: string | undefined;
	let previousAmbientCodexHome: string | undefined;

	beforeEach(() => {
		previousHome = process.env.SUPERSET_HOME_DIR;
		previousCodexHome = process.env.CODEX_HOME;
		previousInjectedCodexHome = process.env.SUPERSET_DEFAULT_CODEX_HOME;
		previousAmbientCodexHome = process.env.SUPERSET_AMBIENT_CODEX_HOME;
		home = mkdtempSync(join(tmpdir(), "superset-default-account-"));
		process.env.SUPERSET_HOME_DIR = home;
	});

	afterEach(() => {
		if (previousHome === undefined) delete process.env.SUPERSET_HOME_DIR;
		else process.env.SUPERSET_HOME_DIR = previousHome;
		for (const [key, value] of [
			["CODEX_HOME", previousCodexHome],
			["SUPERSET_DEFAULT_CODEX_HOME", previousInjectedCodexHome],
			["SUPERSET_AMBIENT_CODEX_HOME", previousAmbientCodexHome],
		] as const) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
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

	it("preserves a custom ambient Codex home beside an injected profile", () => {
		const customDefault = join(home, "custom-codex");
		const selected = join(home, ".codex-work");
		mkdirSync(selected);
		process.env.CODEX_HOME = customDefault;
		delete process.env.SUPERSET_DEFAULT_CODEX_HOME;
		delete process.env.SUPERSET_AMBIENT_CODEX_HOME;
		syncDefaultAccountPointer("codex", selected);

		expect(resolveDefaultAccountEnv(mockDb(undefined), "codex")).toEqual({
			SUPERSET_AMBIENT_CODEX_HOME: customDefault,
			CODEX_HOME: selected,
			SUPERSET_DEFAULT_CODEX_HOME: selected,
		});
	});

	it("preserves the ambient Codex home when the system default is selected", () => {
		const customDefault = join(home, "custom-codex");
		process.env.CODEX_HOME = customDefault;
		delete process.env.SUPERSET_DEFAULT_CODEX_HOME;
		delete process.env.SUPERSET_AMBIENT_CODEX_HOME;
		syncDefaultAccountPointer("codex", null);

		expect(resolveDefaultAccountEnv(mockDb(undefined), "codex")).toEqual({
			SUPERSET_AMBIENT_CODEX_HOME: customDefault,
			CODEX_HOME: customDefault,
			SUPERSET_DEFAULT_CODEX_HOME: customDefault,
		});
	});
});
