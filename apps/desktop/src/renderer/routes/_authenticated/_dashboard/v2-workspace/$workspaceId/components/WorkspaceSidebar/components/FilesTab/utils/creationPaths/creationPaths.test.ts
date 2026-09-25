import { describe, expect, it } from "bun:test";
import { canonicalizeTreePath } from "renderer/lib/pierreTree";
import { buildCreationKey, deriveCreationParent } from "./creationPaths";

const ROOT = "/workspace";

describe("buildCreationKey", () => {
	it("marks folders with a trailing slash and leaves files bare", () => {
		expect(buildCreationKey("", "Untitled", "folder")).toEqual("Untitled/");
		expect(buildCreationKey("", "untitled", "file")).toEqual("untitled");
	});

	it("prefixes the parent directory", () => {
		expect(buildCreationKey("src", "Untitled", "folder")).toEqual(
			"src/Untitled/",
		);
		expect(buildCreationKey("src/components", "untitled", "file")).toEqual(
			"src/components/untitled",
		);
	});
});

describe("creation key ↔ Pierre rename event", () => {
	// The reported bug: `startCreating` registered "Untitled/" but Pierre's
	// onRename reported "Untitled", so the lookup missed, the commit fell through
	// to the rename branch, and we renamed a directory that never existed —
	// ENOENT. The two forms must agree once the event path is canonicalized.
	it("canonicalizes a folder rename event back to the created key", () => {
		const createdKey = buildCreationKey("", "Untitled", "folder");
		const pierreReportedSourcePath = "Untitled"; // isFolder: true, no slash

		expect(canonicalizeTreePath(pierreReportedSourcePath, true)).toEqual(
			createdKey,
		);
	});

	it("canonicalizes a nested folder rename event back to the created key", () => {
		const createdKey = buildCreationKey("src", "Untitled", "folder");

		expect(canonicalizeTreePath("src/Untitled", true)).toEqual(createdKey);
	});

	it("leaves file rename events alone", () => {
		const createdKey = buildCreationKey("src", "untitled", "file");

		expect(canonicalizeTreePath("src/untitled", false)).toEqual(createdKey);
	});
});

describe("deriveCreationParent", () => {
	it("falls back to the workspace root with nothing selected", () => {
		expect(deriveCreationParent([], new Set(), ROOT)).toEqual(ROOT);
	});

	it("creates inside a selected folder", () => {
		const knownPaths = new Set(["src/"]);

		expect(deriveCreationParent(["src/"], knownPaths, ROOT)).toEqual(
			`${ROOT}/src`,
		);
	});

	it("creates inside a selected nested folder", () => {
		const knownPaths = new Set(["src/", "src/deep/"]);

		expect(deriveCreationParent(["src/deep/"], knownPaths, ROOT)).toEqual(
			`${ROOT}/src/deep`,
		);
	});

	it("creates beside a selected file", () => {
		const knownPaths = new Set(["src/", "src/index.ts"]);

		expect(deriveCreationParent(["src/index.ts"], knownPaths, ROOT)).toEqual(
			`${ROOT}/src`,
		);
	});

	it("uses the root for a file selected at the root", () => {
		const knownPaths = new Set(["index.ts"]);

		expect(deriveCreationParent(["index.ts"], knownPaths, ROOT)).toEqual(ROOT);
	});

	// Every folder the user picked resolved to the same directory, because the
	// target came from the editor's open file rather than the tree selection.
	it("follows whichever folder is selected", () => {
		const knownPaths = new Set(["src/", "docs/", "docs/api/"]);

		expect(deriveCreationParent(["src/"], knownPaths, ROOT)).toEqual(
			`${ROOT}/src`,
		);
		expect(deriveCreationParent(["docs/"], knownPaths, ROOT)).toEqual(
			`${ROOT}/docs`,
		);
		expect(deriveCreationParent(["docs/api/"], knownPaths, ROOT)).toEqual(
			`${ROOT}/docs/api`,
		);
	});

	it("honours the last entry of a multi-selection", () => {
		const knownPaths = new Set(["src/", "docs/"]);

		expect(deriveCreationParent(["src/", "docs/"], knownPaths, ROOT)).toEqual(
			`${ROOT}/docs`,
		);
	});

	// REGRESSION: a row can outlive the directory it names — rename a folder and
	// any stale selection still points at the old path. Creating into it asked
	// the host to mkdir inside a directory that no longer existed (ENOENT).
	it("falls back to the root when the selected folder no longer exists", () => {
		const knownPaths = new Set(["test2/", "test2/untitled"]);

		expect(deriveCreationParent(["Untitled/"], knownPaths, ROOT)).toEqual(ROOT);
	});

	it("falls back to the root when a selected file's parent is gone", () => {
		const knownPaths = new Set(["test2/", "test2/untitled"]);

		expect(
			deriveCreationParent(["Untitled/untitled"], knownPaths, ROOT),
		).toEqual(ROOT);
	});
});
