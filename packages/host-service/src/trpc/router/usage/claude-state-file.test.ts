import { afterEach, describe, expect, it, spyOn } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { updateClaudeStateFile } from "./claude-state-file";

const roots: string[] = [];

function tempDir(): string {
	const root = mkdtempSync(join(tmpdir(), "superset-claude-state-"));
	roots.push(root);
	return root;
}

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

describe("updateClaudeStateFile", () => {
	it("creates a missing state file owner-only", async () => {
		const file = join(tempDir(), ".claude.json");
		await updateClaudeStateFile(file, (state) => ({
			...state,
			oauthAccount: { accountUuid: "uuid-a" },
		}));

		expect(JSON.parse(readFileSync(file, "utf-8"))).toEqual({
			oauthAccount: { accountUuid: "uuid-a" },
		});
		expect(statSync(file).mode & 0o777).toBe(0o600);
	});

	it("hands the parsed state to the mutator and preserves untouched keys", async () => {
		const file = join(tempDir(), ".claude.json");
		writeFileSync(
			file,
			JSON.stringify({
				hasCompletedOnboarding: true,
				projects: { "/tmp/session": { hasTrustDialogAccepted: true } },
				oauthAccount: { accountUuid: "uuid-a" },
				userID: "user-a",
			}),
		);

		await updateClaudeStateFile(file, (state) => {
			delete state.oauthAccount;
			delete state.userID;
			return { ...state, oauthAccount: { accountUuid: "uuid-b" } };
		});

		const state = JSON.parse(readFileSync(file, "utf-8"));
		expect(state.oauthAccount).toEqual({ accountUuid: "uuid-b" });
		expect(state.userID).toBeUndefined();
		expect(state.hasCompletedOnboarding).toBe(true);
		expect(state.projects["/tmp/session"].hasTrustDialogAccepted).toBe(true);
	});

	it("treats a corrupt file as empty state instead of failing", async () => {
		const file = join(tempDir(), ".claude.json");
		writeFileSync(file, "{not json");

		await updateClaudeStateFile(file, (state) => ({ ...state, userID: "u" }));

		expect(JSON.parse(readFileSync(file, "utf-8"))).toEqual({ userID: "u" });
	});

	// The bytes a corrupt read discards are the identity, the onboarding flag
	// and every folder-trust entry, so they are copied aside before the write.
	it("backs a corrupt file up owner-only before replacing it", async () => {
		const dir = tempDir();
		const file = join(dir, ".claude.json");
		writeFileSync(file, '{"userID": "user-a", "hasCompletedOn');

		await updateClaudeStateFile(file, (state) => ({ ...state, userID: "u" }));

		const backups = readdirSync(dir).filter((name) =>
			name.endsWith(".superset-swap-bak"),
		);
		expect(backups).toHaveLength(1);
		const backup = join(dir, backups[0] as string);
		expect(readFileSync(backup, "utf-8")).toBe(
			'{"userID": "user-a", "hasCompletedOn',
		);
		expect(statSync(backup).mode & 0o777).toBe(0o600);
		expect(JSON.parse(readFileSync(file, "utf-8"))).toEqual({ userID: "u" });
	});

	// The bytes a rescue saves are the only copy left, so two of them in the
	// same millisecond must not share a name: the second used to fail EEXIST
	// and be discarded as though the first had already saved it.
	it("keeps both backups when two corrupt reads land in the same millisecond", async () => {
		const dir = tempDir();
		const file = join(dir, ".claude.json");
		const clock = spyOn(Date.prototype, "toISOString").mockReturnValue(
			"2026-01-01T00:00:00.000Z",
		);
		try {
			writeFileSync(file, "{first corrupt");
			await updateClaudeStateFile(file, (state) => ({ ...state, userID: "a" }));
			writeFileSync(file, "{second corrupt");
			await updateClaudeStateFile(file, (state) => ({ ...state, userID: "b" }));
		} finally {
			clock.mockRestore();
		}

		const backups = readdirSync(dir)
			.filter((name) => name.endsWith(".superset-swap-bak"))
			.map((name) => readFileSync(join(dir, name), "utf-8"))
			.sort();
		expect(backups).toEqual(["{first corrupt", "{second corrupt"]);
	});

	// A dir quietly filling with backups is the failure this used to hide.
	it("warns rather than fails when a backup cannot be pruned", async () => {
		const dir = tempDir();
		const file = join(dir, ".claude.json");
		// Sorts oldest, so it is the entry the prune reaches for — and a
		// non-empty directory is one `unlink` cannot remove, whoever runs it.
		const stuck = join(dir, ".claude.json.0000-stuck.superset-swap-bak");
		mkdirSync(stuck);
		writeFileSync(join(stuck, "kept"), "x");
		for (const stamp of ["2020-a", "2020-b"]) {
			writeFileSync(
				join(dir, `.claude.json.${stamp}.superset-swap-bak`),
				stamp,
			);
		}
		writeFileSync(file, "{not json");
		const warn = console.warn;
		const warnings: unknown[][] = [];
		console.warn = (...args: unknown[]) => {
			warnings.push(args);
		};

		try {
			await updateClaudeStateFile(file, (state) => ({ ...state, userID: "u" }));
		} finally {
			console.warn = warn;
		}

		expect(warnings).toHaveLength(1);
		expect(String(warnings[0]?.[0])).toContain(file);
		expect(String(warnings[0]?.[1])).toContain(stuck);
		expect(existsSync(stuck)).toBe(true);
		expect(JSON.parse(readFileSync(file, "utf-8"))).toEqual({ userID: "u" });
	});

	// A file that cannot be read is not an empty file: swallowing the error
	// would replace the identity, the onboarding flag and every folder-trust
	// entry with the mutation alone. A regular file in the parent's place fails
	// the read with ENOTDIR for every user, root included — unlike a chmod 000,
	// which root walks straight through.
	it("propagates a read failure instead of starting from empty state", async () => {
		const dir = tempDir();
		const blocker = join(dir, "not-a-dir");
		writeFileSync(blocker, "regular file");

		await expect(
			updateClaudeStateFile(join(blocker, ".claude.json"), (state) => ({
				...state,
				userID: "u",
			})),
		).rejects.toThrow();

		expect(readFileSync(blocker, "utf-8")).toBe("regular file");
		expect(readdirSync(dir)).toEqual(["not-a-dir"]);
	});

	it("leaves no temporary file behind and rewrites in place", async () => {
		const dir = tempDir();
		const file = join(dir, ".claude.json");
		writeFileSync(file, JSON.stringify({ a: 1 }));

		await updateClaudeStateFile(file, (state) => ({ ...state, b: 2 }));

		expect(readdirSync(dir)).toEqual([".claude.json"]);
		expect(JSON.parse(readFileSync(file, "utf-8"))).toEqual({ a: 1, b: 2 });
	});

	it("tightens a world-readable state file to 0600 on rewrite", async () => {
		const file = join(tempDir(), ".claude.json");
		writeFileSync(file, "{}", { mode: 0o644 });

		await updateClaudeStateFile(file, (state) => ({ ...state, b: 2 }));

		expect(statSync(file).mode & 0o777).toBe(0o600);
	});

	// Claude Code, a trust seed and an account swap all write this file. A
	// read-modify-write blind to a change in between replaces the newer file
	// with the older snapshot, dropping the identity or the trust entry the
	// other writer had just added.
	it("re-reads and re-applies when the file changes mid-update", async () => {
		const file = join(tempDir(), ".claude.json");
		writeFileSync(file, JSON.stringify({ userID: "user-a" }));
		let passes = 0;

		await updateClaudeStateFile(file, (state) => {
			// Stands in for the CLI rewriting the file after the read: only on
			// the first pass, so the retry sees a settled file.
			if (passes++ === 0) {
				writeFileSync(
					file,
					JSON.stringify({
						userID: "user-a",
						projects: { "/tmp/other": { hasTrustDialogAccepted: true } },
					}),
				);
			}
			return { ...state, oauthAccount: { accountUuid: "uuid-b" } };
		});

		expect(passes).toBe(2);
		const state = JSON.parse(readFileSync(file, "utf-8"));
		expect(state.oauthAccount).toEqual({ accountUuid: "uuid-b" });
		expect(state.userID).toBe("user-a");
		// The concurrent writer's entry survived the update.
		expect(state.projects["/tmp/other"].hasTrustDialogAccepted).toBe(true);
	});

	// Two of Superset's own writers — a trust seed and the engine's identity
	// re-assertion, say — can be in flight at once, and the fingerprint check
	// cannot save them: both read the same bytes, both see an unchanged file
	// just before their rename, and the second rename drops the first's
	// mutation without either one failing. They queue per path instead.
	it("applies both mutations when two updates run concurrently", async () => {
		const file = join(tempDir(), ".claude.json");
		writeFileSync(file, JSON.stringify({ userID: "user-a" }));

		await Promise.all([
			updateClaudeStateFile(file, (state) => ({
				...state,
				oauthAccount: { accountUuid: "uuid-b" },
			})),
			updateClaudeStateFile(file, (state) => ({
				...state,
				projects: { "/tmp/session": { hasTrustDialogAccepted: true } },
			})),
		]);

		const state = JSON.parse(readFileSync(file, "utf-8"));
		expect(state.userID).toBe("user-a");
		expect(state.oauthAccount).toEqual({ accountUuid: "uuid-b" });
		expect(state.projects["/tmp/session"].hasTrustDialogAccepted).toBe(true);
	});

	it("gives up rather than overwrite a file that keeps changing", async () => {
		const dir = tempDir();
		const file = join(dir, ".claude.json");
		writeFileSync(file, JSON.stringify({ userID: "user-a" }));
		let round = 0;

		await expect(
			updateClaudeStateFile(file, (state) => {
				round += 1;
				writeFileSync(
					file,
					JSON.stringify({ userID: "user-a", pad: "x".repeat(round) }),
				);
				return { ...state, oauthAccount: { accountUuid: "uuid-b" } };
			}),
		).rejects.toThrow(/kept changing/);

		// The other writer's bytes stand, and no half-written temp file is left.
		expect(
			JSON.parse(readFileSync(file, "utf-8")).oauthAccount,
		).toBeUndefined();
		expect(readdirSync(dir)).toEqual([".claude.json"]);
	});

	it("propagates a failure without clobbering the previous state", async () => {
		const dir = tempDir();
		const file = join(dir, "missing", ".claude.json");

		await expect(
			updateClaudeStateFile(file, (state) => state),
		).rejects.toThrow();
		expect(existsSync(file)).toBe(false);
	});
});
