import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	existsSync,
	lstatSync,
	mkdirSync,
	readFileSync,
	readlinkSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	linkSharedDir,
	mergeSharedJsonKeys,
	type ProfileLedger,
	readProfileLedger,
	syncSharedFile,
	writeProfileLedger,
} from "./profile-sharing";

const TEST_ROOT = path.join(
	os.tmpdir(),
	`superset-profile-sharing-${process.pid}-${Date.now()}`,
);
const SOURCE = path.join(TEST_ROOT, "default");
const PROFILE = path.join(TEST_ROOT, "profile");

function ledger(): ProfileLedger {
	return readProfileLedger(PROFILE, SOURCE);
}

beforeEach(() => {
	rmSync(TEST_ROOT, { recursive: true, force: true });
	mkdirSync(SOURCE, { recursive: true });
	mkdirSync(PROFILE, { recursive: true });
});

afterEach(() => {
	rmSync(TEST_ROOT, { recursive: true, force: true });
});

describe("linkSharedDir", () => {
	it("links a free path and is idempotent", () => {
		mkdirSync(path.join(SOURCE, "skills", "demo"), { recursive: true });
		writeFileSync(path.join(SOURCE, "skills", "demo", "SKILL.md"), "hi");

		const target = path.join(PROFILE, "skills");
		expect(linkSharedDir(path.join(SOURCE, "skills"), target)).toBe("linked");
		expect(lstatSync(target).isSymbolicLink()).toBe(true);
		expect(readFileSync(path.join(target, "demo", "SKILL.md"), "utf-8")).toBe(
			"hi",
		);
		expect(linkSharedDir(path.join(SOURCE, "skills"), target)).toBe(
			"unchanged",
		);
	});

	it("shares later additions without re-provisioning", () => {
		mkdirSync(path.join(SOURCE, "skills"), { recursive: true });
		linkSharedDir(path.join(SOURCE, "skills"), path.join(PROFILE, "skills"));

		mkdirSync(path.join(SOURCE, "skills", "added"), { recursive: true });
		expect(existsSync(path.join(PROFILE, "skills", "added"))).toBe(true);
	});

	it("reports absent when the default account has no such dir", () => {
		expect(
			linkSharedDir(
				path.join(SOURCE, "plugins"),
				path.join(PROFILE, "plugins"),
			),
		).toBe("absent");
		expect(existsSync(path.join(PROFILE, "plugins"))).toBe(false);
	});

	it("adopts an empty dir but never one with content", () => {
		mkdirSync(path.join(SOURCE, "skills"), { recursive: true });
		mkdirSync(path.join(PROFILE, "skills"), { recursive: true });
		expect(
			linkSharedDir(path.join(SOURCE, "skills"), path.join(PROFILE, "skills")),
		).toBe("linked");

		rmSync(path.join(PROFILE, "skills"), { recursive: true, force: true });
		mkdirSync(path.join(PROFILE, "skills", "mine"), { recursive: true });
		expect(
			linkSharedDir(path.join(SOURCE, "skills"), path.join(PROFILE, "skills")),
		).toBe("user-owned");
		expect(lstatSync(path.join(PROFILE, "skills")).isDirectory()).toBe(true);
		expect(lstatSync(path.join(PROFILE, "skills")).isSymbolicLink()).toBe(
			false,
		);
	});

	it("leaves a link the user aimed elsewhere, replaces a dangling one", () => {
		mkdirSync(path.join(SOURCE, "skills"), { recursive: true });
		const elsewhere = path.join(TEST_ROOT, "elsewhere");
		mkdirSync(elsewhere, { recursive: true });
		symlinkSync(elsewhere, path.join(PROFILE, "skills"), "dir");
		expect(
			linkSharedDir(path.join(SOURCE, "skills"), path.join(PROFILE, "skills")),
		).toBe("user-owned");
		expect(readlinkSync(path.join(PROFILE, "skills"))).toBe(elsewhere);

		rmSync(elsewhere, { recursive: true, force: true });
		expect(
			linkSharedDir(path.join(SOURCE, "skills"), path.join(PROFILE, "skills")),
		).toBe("linked");
	});
});

describe("syncSharedFile", () => {
	const args = () => ({
		sourcePath: path.join(SOURCE, "CLAUDE.md"),
		targetPath: path.join(PROFILE, "CLAUDE.md"),
		surface: "CLAUDE.md",
		ledger: ledger(),
	});

	it("copies, then reports unchanged", () => {
		writeFileSync(path.join(SOURCE, "CLAUDE.md"), "be brief");
		const first = args();
		expect(syncSharedFile(first)).toBe("synced");
		expect(readFileSync(path.join(PROFILE, "CLAUDE.md"), "utf-8")).toBe(
			"be brief",
		);
		expect(syncSharedFile({ ...first, ledger: first.ledger })).toBe(
			"unchanged",
		);
	});

	it("re-syncs its own copy when the default account changes", () => {
		writeFileSync(path.join(SOURCE, "CLAUDE.md"), "v1");
		const state = args();
		syncSharedFile(state);
		writeProfileLedger(PROFILE, state.ledger);

		writeFileSync(path.join(SOURCE, "CLAUDE.md"), "v2");
		expect(syncSharedFile(args())).toBe("synced");
		expect(readFileSync(path.join(PROFILE, "CLAUDE.md"), "utf-8")).toBe("v2");
	});

	it("never clobbers an edit made inside the profile", () => {
		writeFileSync(path.join(SOURCE, "CLAUDE.md"), "v1");
		const state = args();
		syncSharedFile(state);
		writeProfileLedger(PROFILE, state.ledger);

		writeFileSync(path.join(PROFILE, "CLAUDE.md"), "mine");
		writeFileSync(path.join(SOURCE, "CLAUDE.md"), "v2");
		expect(syncSharedFile(args())).toBe("user-owned");
		expect(readFileSync(path.join(PROFILE, "CLAUDE.md"), "utf-8")).toBe("mine");
	});

	it("leaves a pre-existing file the profile already had", () => {
		writeFileSync(path.join(SOURCE, "CLAUDE.md"), "shared");
		writeFileSync(path.join(PROFILE, "CLAUDE.md"), "theirs");
		expect(syncSharedFile(args())).toBe("user-owned");
	});
});

describe("mergeSharedJsonKeys", () => {
	const settings = () => ({
		sourcePath: path.join(SOURCE, "settings.json"),
		targetPath: path.join(PROFILE, "settings.json"),
		surface: "settings.json",
		ledger: ledger(),
		pick: (source: Record<string, unknown>) => source,
	});

	function readTarget(): Record<string, unknown> {
		return JSON.parse(
			readFileSync(path.join(PROFILE, "settings.json"), "utf-8"),
		);
	}

	it("copies shared keys and preserves keys the profile owns", () => {
		writeFileSync(
			path.join(SOURCE, "settings.json"),
			JSON.stringify({ model: "opus", effortLevel: "high" }),
		);
		writeFileSync(
			path.join(PROFILE, "settings.json"),
			JSON.stringify({ hooks: { Stop: [] } }),
		);

		const state = settings();
		expect(mergeSharedJsonKeys(state)).toBe("merged");
		writeProfileLedger(PROFILE, state.ledger);
		expect(readTarget()).toEqual({
			hooks: { Stop: [] },
			model: "opus",
			effortLevel: "high",
		});
		expect(mergeSharedJsonKeys(settings())).toBe("unchanged");
	});

	it("keeps a value the user changed inside the profile", () => {
		writeFileSync(
			path.join(SOURCE, "settings.json"),
			JSON.stringify({ model: "opus" }),
		);
		const state = settings();
		mergeSharedJsonKeys(state);
		writeProfileLedger(PROFILE, state.ledger);

		writeFileSync(
			path.join(PROFILE, "settings.json"),
			JSON.stringify({ model: "sonnet" }),
		);
		writeFileSync(
			path.join(SOURCE, "settings.json"),
			JSON.stringify({ model: "fable" }),
		);
		expect(mergeSharedJsonKeys(settings())).toBe("unchanged");
		expect(readTarget().model).toBe("sonnet");
	});

	it("skips a state file the profile does not have yet", () => {
		writeFileSync(
			path.join(SOURCE, "settings.json"),
			JSON.stringify({ mcpServers: { linear: {} } }),
		);
		expect(
			mergeSharedJsonKeys({
				...settings(),
				force: { hasCompletedOnboarding: true },
				requireExistingTarget: true,
			}),
		).toBe("absent");
		expect(existsSync(path.join(PROFILE, "settings.json"))).toBe(false);
	});

	it("re-applies forced values even when they were changed", () => {
		writeFileSync(path.join(SOURCE, "settings.json"), JSON.stringify({}));
		writeFileSync(
			path.join(PROFILE, "settings.json"),
			JSON.stringify({ hasCompletedOnboarding: false }),
		);
		expect(
			mergeSharedJsonKeys({
				...settings(),
				force: { hasCompletedOnboarding: true },
				requireExistingTarget: true,
			}),
		).toBe("merged");
		expect(readTarget().hasCompletedOnboarding).toBe(true);
	});

	it("leaves an unparsable profile file alone", () => {
		writeFileSync(
			path.join(SOURCE, "settings.json"),
			JSON.stringify({ model: "opus" }),
		);
		writeFileSync(path.join(PROFILE, "settings.json"), "{ not json");
		expect(mergeSharedJsonKeys(settings())).toBe("user-owned");
		expect(readFileSync(path.join(PROFILE, "settings.json"), "utf-8")).toBe(
			"{ not json",
		);
	});
});
