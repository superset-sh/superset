import { afterEach, describe, expect, it } from "bun:test";
import {
	closeSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	openSync,
	readdirSync,
	readFileSync,
	readlinkSync,
	realpathSync,
	rmSync,
	symlinkSync,
	unlinkSync,
	writeFileSync,
	writeSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import {
	mergeAndLinkSessionDir,
	sameFilesystem,
	shareableProfileDir,
	shareClaudeSessionState,
	shareCodexSessionState,
} from "./session-share";

const CLAUDE_HOMES = [".claude", ".config/claude"];
const roots = new Set<string>();

afterEach(() => {
	for (const root of roots) rmSync(root, { recursive: true, force: true });
	roots.clear();
});

function makeDirs(): { profile: string; main: string } {
	const root = mkdtempSync(join(tmpdir(), "claude-session-share-"));
	roots.add(root);
	const profile = join(root, "profile");
	const main = join(root, "main");
	mkdirSync(profile);
	mkdirSync(main);
	return { profile, main };
}

function isLinkTo(path: string, target: string): boolean {
	return lstatSync(path).isSymbolicLink() && readlinkSync(path) === target;
}

function lstatOrNull(path: string) {
	try {
		return lstatSync(path);
	} catch {
		return null;
	}
}

describe("shareableProfileDir", () => {
	it("refuses the default homes and the main home itself", () => {
		const home = homedir();
		const main = join(home, ".claude");
		expect(shareableProfileDir(home, main, CLAUDE_HOMES)).toBeNull();
		expect(
			shareableProfileDir(join(home, ".claude"), main, CLAUDE_HOMES),
		).toBeNull();
		expect(
			shareableProfileDir(join(home, ".config", "claude"), main, CLAUDE_HOMES),
		).toBeNull();
		expect(
			shareableProfileDir("/tmp/custom-main", "/tmp/custom-main", CLAUDE_HOMES),
		).toBeNull();
	});

	it("accepts an ordinary profile dir", () => {
		const home = homedir();
		expect(
			shareableProfileDir(
				join(home, ".claude-work"),
				join(home, ".claude"),
				CLAUDE_HOMES,
			),
		).toBe(join(home, ".claude-work"));
	});
});

describe("sameFilesystem", () => {
	it("detects when a rename would cross filesystem devices", () => {
		expect(
			sameFilesystem("profile", "main", (path) =>
				path === "profile" ? 41 : 42,
			),
		).toBe(false);
		expect(sameFilesystem("profile", "main", () => 41)).toBe(true);
	});

	it("leaves an existing session tree visible when devices differ", () => {
		const { profile, main } = makeDirs();
		mkdirSync(join(profile, "sessions"));
		writeFileSync(join(profile, "sessions", "rollout.jsonl"), "session");

		mergeAndLinkSessionDir(profile, main, "sessions", () => false);

		expect(lstatSync(join(profile, "sessions")).isSymbolicLink()).toBe(false);
		expect(
			readFileSync(join(profile, "sessions", "rollout.jsonl"), "utf8"),
		).toBe("session");
		expect(lstatOrNull(join(profile, "sessions.superset-merge"))).toBeNull();
	});

	it("restores an interrupted session tree when recovery crosses devices", () => {
		const { profile, main } = makeDirs();
		const pending = join(profile, "sessions.superset-merge");
		mkdirSync(pending);
		writeFileSync(join(pending, "rollout.jsonl"), "session");

		mergeAndLinkSessionDir(profile, main, "sessions", () => false);

		expect(lstatSync(join(profile, "sessions")).isDirectory()).toBe(true);
		expect(
			readFileSync(join(profile, "sessions", "rollout.jsonl"), "utf8"),
		).toBe("session");
		expect(lstatOrNull(pending)).toBeNull();
	});
});

describe("shareClaudeSessionState", () => {
	it("links a fresh profile's session entries into main", () => {
		const { profile, main } = makeDirs();
		shareClaudeSessionState(profile, main);
		for (const name of ["projects", "sessions", "file-history", "todos"]) {
			expect(isLinkTo(join(profile, name), join(main, name))).toBe(true);
			expect(lstatSync(join(main, name)).isDirectory()).toBe(true);
		}
		expect(
			isLinkTo(join(profile, "history.jsonl"), join(main, "history.jsonl")),
		).toBe(true);
	});

	it("merges existing session trees into main before linking", () => {
		const { profile, main } = makeDirs();
		mkdirSync(join(profile, "projects", "-repo-a"), { recursive: true });
		writeFileSync(join(profile, "projects", "-repo-a", "s1.jsonl"), "a");
		mkdirSync(join(main, "projects", "-repo-b"), { recursive: true });
		writeFileSync(join(main, "projects", "-repo-b", "s2.jsonl"), "b");
		shareClaudeSessionState(profile, main);
		expect(isLinkTo(join(profile, "projects"), join(main, "projects"))).toBe(
			true,
		);
		expect(
			readFileSync(join(main, "projects", "-repo-a", "s1.jsonl"), "utf-8"),
		).toBe("a");
		expect(
			readFileSync(join(main, "projects", "-repo-b", "s2.jsonl"), "utf-8"),
		).toBe("b");
		// The merged file is reachable through the profile's own path too.
		expect(
			readFileSync(join(profile, "projects", "-repo-a", "s1.jsonl"), "utf-8"),
		).toBe("a");
	});

	it("leaves conflicting files behind in the pending dir and still links", () => {
		const { profile, main } = makeDirs();
		mkdirSync(join(profile, "projects", "-repo"), { recursive: true });
		writeFileSync(join(profile, "projects", "-repo", "s.jsonl"), "profile");
		mkdirSync(join(main, "projects", "-repo"), { recursive: true });
		writeFileSync(join(main, "projects", "-repo", "s.jsonl"), "main");
		shareClaudeSessionState(profile, main);
		expect(isLinkTo(join(profile, "projects"), join(main, "projects"))).toBe(
			true,
		);
		expect(
			readFileSync(join(main, "projects", "-repo", "s.jsonl"), "utf-8"),
		).toBe("main");
		expect(
			readFileSync(
				join(profile, "projects.superset-merge", "-repo", "s.jsonl"),
				"utf-8",
			),
		).toBe("profile");
	});

	it("flushes a pending dir left by an interrupted merge", () => {
		const { profile, main } = makeDirs();
		mkdirSync(join(profile, "projects.superset-merge", "-repo"), {
			recursive: true,
		});
		writeFileSync(
			join(profile, "projects.superset-merge", "-repo", "s.jsonl"),
			"leftover",
		);
		symlinkSync(join(main, "projects"), join(profile, "projects"));
		mkdirSync(join(main, "projects"));
		shareClaudeSessionState(profile, main);
		expect(
			readFileSync(join(main, "projects", "-repo", "s.jsonl"), "utf-8"),
		).toBe("leftover");
		expect(readdirSync(profile)).not.toContain("projects.superset-merge");
	});

	it("separates records when main's history lacks a trailing newline", () => {
		const { profile, main } = makeDirs();
		writeFileSync(join(main, "history.jsonl"), '{"m":1}'); // crash-truncated
		writeFileSync(join(profile, "history.jsonl"), '{"p":1}\n');
		shareClaudeSessionState(profile, main);
		expect(readFileSync(join(main, "history.jsonl"), "utf-8")).toBe(
			'{"m":1}\n{"p":1}\n',
		);
	});

	it("refuses a profile dir that is a symlink alias of the main home", () => {
		const { profile, main } = makeDirs();
		const alias = join(profile, "..", "main-alias");
		symlinkSync(main, alias);
		expect(shareableProfileDir(alias, main, CLAUDE_HOMES)).toBeNull();
	});

	it("appends the profile's prompt history to main's", () => {
		const { profile, main } = makeDirs();
		writeFileSync(join(main, "history.jsonl"), '{"m":1}\n');
		writeFileSync(join(profile, "history.jsonl"), '{"p":1}\n');
		shareClaudeSessionState(profile, main);
		expect(
			isLinkTo(join(profile, "history.jsonl"), join(main, "history.jsonl")),
		).toBe(true);
		expect(readFileSync(join(main, "history.jsonl"), "utf-8")).toBe(
			'{"m":1}\n{"p":1}\n',
		);
		// Re-provisioning drains only bytes written since the last cursor.
		shareClaudeSessionState(profile, main);
		expect(readFileSync(join(main, "history.jsonl"), "utf-8")).toBe(
			'{"m":1}\n{"p":1}\n',
		);
	});

	it("leaves config surfaces to agent-setup provisioning", () => {
		const { profile, main } = makeDirs();
		writeFileSync(join(main, "settings.json"), "{}");
		writeFileSync(join(main, "CLAUDE.md"), "memory");
		mkdirSync(join(main, "agents"));
		shareClaudeSessionState(profile, main);
		for (const name of ["settings.json", "CLAUDE.md", "agents", "skills"]) {
			expect(lstatOrNull(join(profile, name))).toBeNull();
		}
	});

	it("leaves existing symlinks alone, wherever they point", () => {
		const { profile, main } = makeDirs();
		const elsewhere = join(profile, "elsewhere");
		mkdirSync(elsewhere);
		symlinkSync(elsewhere, join(profile, "projects"));
		shareClaudeSessionState(profile, main);
		expect(readlinkSync(join(profile, "projects"))).toBe(elsewhere);
	});

	it("never touches identity or runtime entries", () => {
		const { profile, main } = makeDirs();
		writeFileSync(join(profile, ".claude.json"), '{"oauthAccount":{}}');
		writeFileSync(join(profile, ".credentials.json"), "secret");
		mkdirSync(join(profile, "daemon"));
		shareClaudeSessionState(profile, main);
		expect(lstatSync(join(profile, ".claude.json")).isSymbolicLink()).toBe(
			false,
		);
		expect(lstatSync(join(profile, ".credentials.json")).isSymbolicLink()).toBe(
			false,
		);
		expect(lstatSync(join(profile, "daemon")).isSymbolicLink()).toBe(false);
		expect(readdirSync(main)).not.toContain(".claude.json");
		expect(readdirSync(main)).not.toContain(".credentials.json");
	});
});

describe("shareCodexSessionState", () => {
	it("links a fresh Codex home's rollout dirs and history into main", () => {
		const { profile, main } = makeDirs();
		shareCodexSessionState(profile, main);
		for (const name of ["sessions", "archived_sessions", "shell_snapshots"]) {
			expect(isLinkTo(join(profile, name), join(main, name))).toBe(true);
			expect(lstatSync(join(main, name)).isDirectory()).toBe(true);
		}
		expect(
			isLinkTo(join(profile, "history.jsonl"), join(main, "history.jsonl")),
		).toBe(true);
	});

	it("merges both accounts' rollouts into one resumable tree", () => {
		const { profile, main } = makeDirs();
		// Codex keys rollouts by date, so the two accounts land side by side in
		// the same day directory — the case `codex resume` has to see whole.
		mkdirSync(join(profile, "sessions", "2026", "08", "31"), {
			recursive: true,
		});
		writeFileSync(
			join(profile, "sessions", "2026", "08", "31", "rollout-work.jsonl"),
			"work",
		);
		mkdirSync(join(main, "sessions", "2026", "08", "31"), { recursive: true });
		writeFileSync(
			join(main, "sessions", "2026", "08", "31", "rollout-personal.jsonl"),
			"personal",
		);
		shareCodexSessionState(profile, main);

		expect(isLinkTo(join(profile, "sessions"), join(main, "sessions"))).toBe(
			true,
		);
		const day = join(main, "sessions", "2026", "08", "31");
		expect(readdirSync(day).sort()).toEqual([
			"rollout-personal.jsonl",
			"rollout-work.jsonl",
		]);
		// Both are reachable through the profile's own path, which is what the
		// CLI will be pointed at by CODEX_HOME.
		expect(
			readdirSync(join(profile, "sessions", "2026", "08", "31")).sort(),
		).toEqual(["rollout-personal.jsonl", "rollout-work.jsonl"]);
	});

	it("appends an existing Codex prompt history instead of dropping it", () => {
		const { profile, main } = makeDirs();
		writeFileSync(join(profile, "history.jsonl"), '{"t":"from-profile"}\n');
		writeFileSync(join(main, "history.jsonl"), '{"t":"from-main"}\n');
		shareCodexSessionState(profile, main);
		const merged = readFileSync(join(main, "history.jsonl"), "utf-8");
		expect(merged).toContain("from-main");
		expect(merged).toContain("from-profile");
		expect(
			isLinkTo(join(profile, "history.jsonl"), join(main, "history.jsonl")),
		).toBe(true);
	});

	it("drains a write made through an fd opened before the history swap", () => {
		const { profile, main } = makeDirs();
		const profileHistory = join(profile, "history.jsonl");
		writeFileSync(profileHistory, '{"t":"before-switch"}\n');
		const oldFd = openSync(profileHistory, "a");

		shareCodexSessionState(profile, main);
		writeSync(oldFd, '{"t":"in-flight"}\n');
		closeSync(oldFd);

		// The old inode remains durable and the next normal provision drains the
		// late append without duplicating the bytes already imported.
		shareCodexSessionState(profile, main);
		const merged = readFileSync(join(main, "history.jsonl"), "utf-8");
		expect(merged.match(/before-switch/g)).toHaveLength(1);
		expect(merged.match(/in-flight/g)).toHaveLength(1);
		expect(
			readFileSync(join(profile, "history.jsonl.superset-merge"), "utf-8"),
		).toContain("in-flight");
		expect(
			readFileSync(
				join(profile, "history.jsonl.superset-merge.offset"),
				"utf-8",
			),
		).toBe(
			`${Buffer.byteLength('{"t":"before-switch"}\n{"t":"in-flight"}\n')}\n`,
		);
	});

	it("drains numbered history captures in generation order", () => {
		const { profile, main } = makeDirs();
		for (let generation = 0; generation <= 10; generation += 1) {
			const suffix = generation === 0 ? "" : `-${generation}`;
			writeFileSync(
				join(profile, `history.jsonl.superset-merge${suffix}`),
				`${generation}\n`,
			);
		}

		shareCodexSessionState(profile, main);

		expect(
			readFileSync(join(main, "history.jsonl"), "utf-8").trim().split("\n"),
		).toEqual(Array.from({ length: 11 }, (_, generation) => `${generation}`));
	});

	it("re-links a history file the CLI replaced with a real file", () => {
		const { profile, main } = makeDirs();
		shareCodexSessionState(profile, main);
		// A rename-over-symlink forks the log; the next provision must heal it
		// rather than leave the two accounts writing separate histories.
		unlinkSync(join(profile, "history.jsonl"));
		writeFileSync(join(profile, "history.jsonl"), '{"t":"forked"}\n');
		shareCodexSessionState(profile, main);
		expect(
			isLinkTo(join(profile, "history.jsonl"), join(main, "history.jsonl")),
		).toBe(true);
		expect(readFileSync(join(main, "history.jsonl"), "utf-8")).toContain(
			"forked",
		);
	});

	it("refuses to share the default Codex home into itself", () => {
		const home = homedir();
		const main = join(home, ".codex");
		expect(shareableProfileDir(home, main, [".codex"])).toBeNull();
		expect(shareableProfileDir(main, main, [".codex"])).toBeNull();
		expect(
			shareableProfileDir(join(home, ".codex-work"), main, [".codex"]),
		).toBe(join(home, ".codex-work"));
	});

	it("allows a fixed Codex home to share into a user-defined main home", () => {
		const { profile, main } = makeDirs();
		expect(shareableProfileDir(profile, main, [])).toBe(realpathSync(profile));
	});

	it("never touches auth.json, so accounts keep separate credentials", () => {
		const { profile, main } = makeDirs();
		writeFileSync(join(profile, "auth.json"), '{"account":"work"}');
		writeFileSync(join(main, "auth.json"), '{"account":"personal"}');
		shareCodexSessionState(profile, main);
		expect(lstatSync(join(profile, "auth.json")).isSymbolicLink()).toBe(false);
		expect(readFileSync(join(profile, "auth.json"), "utf-8")).toBe(
			'{"account":"work"}',
		);
		expect(readFileSync(join(main, "auth.json"), "utf-8")).toBe(
			'{"account":"personal"}',
		);
	});
});
