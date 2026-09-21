import { describe, expect, it } from "bun:test";
import { parseGitHubRemote } from "@superset/shared/github-remote";
import { findMatchingRemote, type ParsedGitHubRemote } from "./git-remote";

function remotes(entries: Record<string, string>) {
	const map = new Map<string, ParsedGitHubRemote>();
	for (const [name, url] of Object.entries(entries)) {
		const parsed = parseGitHubRemote(url);
		if (parsed) map.set(name, parsed);
	}
	return map;
}

describe("findMatchingRemote", () => {
	it("prefers origin over an earlier secondary remote with the same slug", () => {
		const map = remotes({
			backup: "https://github.com/owner/a.git",
			origin: "git@github.com:owner/a.git",
		});
		expect([...map.keys()]).toEqual(["backup", "origin"]);
		expect(findMatchingRemote(map, "owner/a")).toBe("origin");
	});

	it("falls back to the first matching secondary remote when origin does not match", () => {
		const map = remotes({
			origin: "git@github.com:owner/b.git",
			a: "git@github.com:owner/a.git",
		});
		expect(findMatchingRemote(map, "owner/a")).toBe("a");
	});

	it("matches slugs case-insensitively", () => {
		const map = remotes({ origin: "git@github.com:Owner/A.git" });
		expect(findMatchingRemote(map, "owner/a")).toBe("origin");
	});

	it("returns null when nothing matches", () => {
		const map = remotes({ origin: "git@github.com:owner/b.git" });
		expect(findMatchingRemote(map, "owner/a")).toBeNull();
	});
});
