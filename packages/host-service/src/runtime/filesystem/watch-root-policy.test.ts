import { afterEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { forbiddenRootReason } from "./watch-root-policy";

const env = {
	homeDir: "/Users/peta",
	supersetHomeDir: "/Users/peta/.superset",
};

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

function fixture() {
	const root = mkdtempSync(path.join(tmpdir(), "root-policy-"));
	roots.push(root);
	const homeDir = path.join(root, "home");
	mkdirSync(homeDir);
	const alias = path.join(root, "alias");
	symlinkSync(homeDir, alias, "junction");
	return {
		root,
		alias,
		homeDir,
		supersetHomeDir: path.join(homeDir, ".superset"),
	};
}

describe("forbiddenRootReason", () => {
	it("refuses a symlink to the home directory, including an aliased policy home", () => {
		const f = fixture();
		expect(forbiddenRootReason(f.alias, f)).toBe("home-directory");
		expect(forbiddenRootReason(f.homeDir, { ...f, homeDir: f.alias })).toBe(
			"home-directory",
		);
	});

	it("refuses a symlink to the filesystem root", () => {
		const f = fixture();
		const alias = path.join(f.root, "disk");
		symlinkSync(path.parse(f.root).root, alias, "junction");
		expect(forbiddenRootReason(alias, f)).toBe("filesystem-root");
	});

	it("resolves existing parents when the relocated data directory does not exist yet", () => {
		const f = fixture();
		const relocated = {
			homeDir: path.join(f.root, "other"),
			supersetHomeDir: path.join(f.alias, "missing", ".superset"),
		};
		expect(forbiddenRootReason(f.homeDir, relocated)).toBe(
			"contains-superset-home",
		);
	});

	it("allows symlinks to ordinary repositories and sibling names with the same prefix", () => {
		const f = fixture();
		mkdirSync(path.join(f.homeDir, "repo"));
		const alias = path.join(f.root, "repo-alias");
		symlinkSync(path.join(f.homeDir, "repo"), alias, "junction");
		expect(forbiddenRootReason(alias, f)).toBeNull();
		expect(forbiddenRootReason(`${f.homeDir}-other`, f)).toBeNull();
	});
	it("refuses the home directory, with or without a trailing slash", () => {
		expect(forbiddenRootReason("/Users/peta", env)).toBe("home-directory");
		expect(forbiddenRootReason("/Users/peta/", env)).toBe("home-directory");
	});

	it("refuses filesystem roots", () => {
		expect(forbiddenRootReason("/", env)).toBe("filesystem-root");
	});

	it("refuses any ancestor of the superset home directory", () => {
		expect(forbiddenRootReason("/Users", env)).toBe("contains-superset-home");
	});

	it("allows a repository inside the home directory", () => {
		expect(forbiddenRootReason("/Users/peta/popcamcode", env)).toBeNull();
		expect(
			forbiddenRootReason("/Users/peta/.superset/worktrees/p/w", env),
		).toBeNull();
	});

	it("allows a repository elsewhere on disk", () => {
		expect(forbiddenRootReason("/opt/src/app", env)).toBeNull();
	});

	it("honours a relocated superset home directory", () => {
		const relocated = {
			homeDir: "/Users/peta",
			supersetHomeDir: "/data/superset",
		};
		expect(forbiddenRootReason("/data", relocated)).toBe(
			"contains-superset-home",
		);
		expect(forbiddenRootReason("/Users", relocated)).toBeNull();
	});
});
