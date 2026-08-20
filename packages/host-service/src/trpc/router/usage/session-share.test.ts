import { describe, expect, it } from "bun:test";
import {
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	readlinkSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { shareableProfileDir, shareClaudeSessionState } from "./session-share";

function makeDirs(): { profile: string; main: string } {
	const root = mkdtempSync(join(tmpdir(), "claude-session-share-"));
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
		expect(shareableProfileDir(home, main)).toBeNull();
		expect(shareableProfileDir(join(home, ".claude"), main)).toBeNull();
		expect(
			shareableProfileDir(join(home, ".config", "claude"), main),
		).toBeNull();
		expect(
			shareableProfileDir("/tmp/custom-main", "/tmp/custom-main"),
		).toBeNull();
	});

	it("accepts an ordinary profile dir", () => {
		const home = homedir();
		expect(
			shareableProfileDir(join(home, ".claude-work"), join(home, ".claude")),
		).toBe(join(home, ".claude-work"));
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
		expect(shareableProfileDir(alias, main)).toBeNull();
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
