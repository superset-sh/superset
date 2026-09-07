import { describe, expect, it } from "bun:test";
import { forbiddenRootReason } from "./watch-root-policy";

const env = {
	homeDir: "/Users/peta",
	supersetHomeDir: "/Users/peta/.superset",
};

describe("forbiddenRootReason", () => {
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
