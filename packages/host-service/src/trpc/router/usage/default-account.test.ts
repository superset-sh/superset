import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HostDb } from "../../../db/index.ts";
import {
	activeClaudeConfigDirPath,
	applyAccountEngineState,
	getDefaultAccountSelections,
	isActiveAccount,
	isActiveClaudeDirPointer,
	readAccountEngineView,
	recordIdentityBindings,
	resolveDefaultAccountEnv,
	syncDefaultAccountPointer,
	syncDefaultAccountPointers,
} from "./default-account.ts";
import type { UsageAccount } from "./types.ts";

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

/**
 * KTD2/KTD4: once a swap has run the pointer names the Superset-owned active
 * dir rather than a profile, so "which account is active" comes from the
 * engine's recorded binding, and the org DB's stale copy of the pointer is
 * brought back in line.
 */
describe("active account semantics", () => {
	let home: string;
	let previousHome: string | undefined;
	const writes: Array<Record<string, unknown>> = [];

	function trackingDb(defaultClaudeConfigDir: string | null): HostDb {
		return {
			select: () => ({
				from: () => ({
					get: () => ({ defaultClaudeConfigDir, defaultCodexHome: null }),
				}),
			}),
			insert: () => ({
				values: (values: Record<string, unknown>) => ({
					onConflictDoUpdate: () => ({
						run: () => {
							writes.push(values);
						},
					}),
				}),
			}),
		} as unknown as HostDb;
	}

	function stateDir(): string {
		const dir = join(home, "state", "account-engine");
		mkdirSync(dir, { recursive: true, mode: 0o700 });
		return dir;
	}

	function writeRuntime(runtime: unknown): void {
		writeFileSync(join(stateDir(), "runtime.json"), JSON.stringify(runtime), {
			mode: 0o600,
		});
	}

	function account(overrides: Partial<UsageAccount>): UsageAccount {
		return {
			agent: "claude",
			credentialKind: "subscription",
			accountKey: "key",
			sourceLabel: "~/.claude",
			email: null,
			plan: null,
			status: "ok",
			statusDetail: null,
			windows: [],
			creditsBalance: null,
			extraUsage: null,
			selection: null,
			accountId: null,
			inRotation: true,
			managed: true,
			isDefault: false,
			fetchedAt: new Date(0),
			...overrides,
		};
	}

	beforeEach(() => {
		previousHome = process.env.SUPERSET_HOME_DIR;
		home = mkdtempSync(join(tmpdir(), "superset-active-account-"));
		process.env.SUPERSET_HOME_DIR = home;
		writes.length = 0;
	});

	afterEach(() => {
		if (previousHome === undefined) delete process.env.SUPERSET_HOME_DIR;
		else process.env.SUPERSET_HOME_DIR = previousHome;
		rmSync(home, { recursive: true, force: true });
	});

	it("recognises the active dir behind any spelling of its path", () => {
		const activeDir = activeClaudeConfigDirPath();
		mkdirSync(activeDir, { recursive: true });
		const alias = join(home, "active-alias");
		symlinkSync(activeDir, alias);

		expect(isActiveClaudeDirPointer(activeDir)).toBe(true);
		expect(isActiveClaudeDirPointer(alias)).toBe(true);
		expect(isActiveClaudeDirPointer(join(home, ".claude-work"))).toBe(false);
		expect(isActiveClaudeDirPointer(null)).toBe(false);
	});

	it("syncs the org DB copy once the pointer names the active dir", () => {
		const activeDir = activeClaudeConfigDirPath();
		mkdirSync(activeDir, { recursive: true });
		syncDefaultAccountPointer("claude", activeDir);

		expect(
			getDefaultAccountSelections(trackingDb("/home/u/.claude-work"))
				.claudeConfigDir,
		).toBe(activeDir);
		expect(writes).toEqual([{ id: 1, defaultClaudeConfigDir: activeDir }]);

		// Already in sync: no second write on every terminal launch.
		writes.length = 0;
		getDefaultAccountSelections(trackingDb(activeDir));
		expect(writes).toEqual([]);
	});

	it("reads the active account from the engine binding, not the pointer", () => {
		const activeDir = activeClaudeConfigDirPath();
		mkdirSync(activeDir, { recursive: true });
		syncDefaultAccountPointer("claude", activeDir);
		writeRuntime({
			version: 1,
			perAgent: {
				claude: {
					cooldownUntil: null,
					exhaustedNotifiedAt: null,
					fallbackTimestamps: [],
					activeAccountId: "uuid-b",
					activeSelection: "/home/u/.claude-b",
				},
				codex: {
					cooldownUntil: null,
					exhaustedNotifiedAt: null,
					fallbackTimestamps: [],
					activeAccountId: null,
					activeSelection: null,
				},
			},
			identityBindings: {},
		});
		const view = readAccountEngineView(trackingDb(activeDir));
		const first = account({
			accountId: "uuid-a",
			selection: "/home/u/.claude-a",
		});
		const second = account({
			accountId: "uuid-b",
			selection: "/home/u/.claude-b",
		});

		expect(isActiveAccount(first, view)).toBe(false);
		expect(isActiveAccount(second, view)).toBe(true);
	});

	it("falls back to the pointer rule when the engine recorded nothing", () => {
		syncDefaultAccountPointer("claude", "/home/u/.claude-a");
		const view = readAccountEngineView(trackingDb(null));

		expect(
			isActiveAccount(
				account({ accountId: "uuid-a", selection: "/home/u/.claude-a" }),
				view,
			),
		).toBe(true);
		expect(
			isActiveAccount(account({ accountId: "uuid-b", selection: null }), view),
		).toBe(false);
	});

	it("holds API-key accounts out of rotation until the toggle says otherwise", () => {
		const apiKey = account({
			credentialKind: "api_key",
			accountId: null,
			selection: "/home/u/.claude-api",
			inRotation: false,
		});
		const view = readAccountEngineView(trackingDb(null));

		expect(applyAccountEngineState(apiKey, view).inRotation).toBe(false);

		writeFileSync(
			join(stateDir(), "rotation.json"),
			JSON.stringify({ "claude:/home/u/.claude-api": true }),
			{ mode: 0o600 },
		);
		const flipped = readAccountEngineView(trackingDb(null));

		expect(applyAccountEngineState(apiKey, flipped).inRotation).toBe(true);
	});

	it("records identity-to-dir bindings, and never on a read-only state dir", () => {
		recordIdentityBindings([
			["uuid-a", "/home/u/.claude-a"],
			["uuid-default", null],
		]);

		const runtimePath = join(home, "state", "account-engine", "runtime.json");
		expect(
			JSON.parse(readFileSync(runtimePath, "utf8")).identityBindings,
		).toEqual({ "uuid-a": "/home/u/.claude-a", "uuid-default": null });

		chmodSync(join(home, "state", "account-engine"), 0o777);
		recordIdentityBindings([["uuid-b", "/home/u/.claude-b"]]);
		expect(
			JSON.parse(readFileSync(runtimePath, "utf8")).identityBindings,
		).toEqual({ "uuid-a": "/home/u/.claude-a", "uuid-default": null });
	});
});
