import { describe, expect, test } from "bun:test";

/**
 * Extracted from the `update` procedure in status.ts (lines 138-146).
 * This is the logic that decides whether a workspace stays "unnamed"
 * after a name update.
 */
function resolveIsUnnamed(patch: {
	name?: string;
	preserveUnnamedStatus?: boolean;
	isUnnamed?: boolean;
}): boolean | undefined {
	if (patch.isUnnamed !== undefined) return patch.isUnnamed;
	if (patch.name !== undefined && !patch.preserveUnnamedStatus) return false;
	return undefined;
}

describe("resolveIsUnnamed", () => {
	test("explicit isUnnamed flag takes precedence", () => {
		expect(resolveIsUnnamed({ isUnnamed: true })).toBe(true);
		expect(resolveIsUnnamed({ isUnnamed: false })).toBe(false);
		expect(resolveIsUnnamed({ name: "test", isUnnamed: true })).toBe(true);
	});

	test("setting name without preserveUnnamedStatus marks as named", () => {
		expect(resolveIsUnnamed({ name: "My Workspace" })).toBe(false);
	});

	test("setting name with preserveUnnamedStatus keeps unnamed status", () => {
		// This is what the terminal title rename currently does — it passes
		// preserveUnnamedStatus: true, so the workspace stays unnamed and
		// every subsequent terminal title change keeps overwriting the name.
		expect(
			resolveIsUnnamed({ name: "Claude Code", preserveUnnamedStatus: true }),
		).toBe(undefined); // undefined = no change to isUnnamed
	});

	test("no name change returns undefined", () => {
		expect(resolveIsUnnamed({})).toBe(undefined);
	});
});

/**
 * Extracted from Terminal.tsx — strips leading emoji from terminal titles.
 */
const stripLeadingEmoji = (text: string) =>
	text.trim().replace(/^[\p{Emoji}\p{Symbol}]\s*/u, "");

describe("stripLeadingEmoji", () => {
	test("strips leading emoji", () => {
		expect(stripLeadingEmoji("🚀 Claude Code")).toBe("Claude Code");
	});

	test("passes through plain text", () => {
		expect(stripLeadingEmoji("Claude Code")).toBe("Claude Code");
	});

	test("trims whitespace", () => {
		expect(stripLeadingEmoji("  bash  ")).toBe("bash");
	});

	test("returns empty for empty string", () => {
		expect(stripLeadingEmoji("")).toBe("");
	});
});

describe("terminal title rename bug (#2355)", () => {
	/**
	 * This test demonstrates the bug: when a terminal title changes on an
	 * unnamed workspace, the rename uses preserveUnnamedStatus: true.
	 * This means isUnnamed stays true, so EVERY subsequent title change
	 * keeps overwriting the workspace name.
	 *
	 * Scenario: User creates workspace → terminal shows "Claude Code" →
	 * user quits CC → terminal shows "user@host:~/path" → workspace name
	 * keeps changing to whatever the terminal title is.
	 */
	test("preserveUnnamedStatus: true causes perpetual renaming (the bug)", () => {
		let workspaceName = "feat/my-branch";
		let isUnnamed = true;

		// Simulate the renameUnnamedWorkspace callback from Terminal.tsx
		const renameUnnamedWorkspace = (
			title: string,
			preserveUnnamedStatus: boolean,
		) => {
			const cleanedTitle = stripLeadingEmoji(title);
			if (isUnnamed && cleanedTitle) {
				workspaceName = cleanedTitle;
				// Simulate resolveIsUnnamed logic from status.ts
				const newIsUnnamed = resolveIsUnnamed({
					name: cleanedTitle,
					preserveUnnamedStatus,
				});
				if (newIsUnnamed !== undefined) {
					isUnnamed = newIsUnnamed;
				}
			}
		};

		// Terminal title changes to "Claude Code"
		renameUnnamedWorkspace("Claude Code", true);
		expect(workspaceName).toBe("Claude Code");
		// BUG: isUnnamed is still true because preserveUnnamedStatus: true
		expect(isUnnamed).toBe(true);

		// User quits Claude Code, terminal title changes to shell prompt
		renameUnnamedWorkspace("user@host:~/projects/my-app", true);
		// BUG: name gets overwritten again because isUnnamed is still true
		expect(workspaceName).toBe("user@host:~/projects/my-app");
		expect(isUnnamed).toBe(true);

		// Any program that sets terminal title will keep overwriting
		renameUnnamedWorkspace("vim README.md", true);
		expect(workspaceName).toBe("vim README.md");
		expect(isUnnamed).toBe(true); // still unnamed — perpetual overwrite
	});

	test("fix: first terminal title rename should mark workspace as named", () => {
		let workspaceName = "feat/my-branch";
		let isUnnamed = true;

		const renameUnnamedWorkspace = (
			title: string,
			preserveUnnamedStatus: boolean,
		) => {
			const cleanedTitle = stripLeadingEmoji(title);
			if (isUnnamed && cleanedTitle) {
				workspaceName = cleanedTitle;
				const newIsUnnamed = resolveIsUnnamed({
					name: cleanedTitle,
					preserveUnnamedStatus,
				});
				if (newIsUnnamed !== undefined) {
					isUnnamed = newIsUnnamed;
				}
			}
		};

		// Terminal title changes to "Claude Code" — with fix, no preserveUnnamedStatus
		renameUnnamedWorkspace("Claude Code", false);
		expect(workspaceName).toBe("Claude Code");
		// FIX: isUnnamed is now false
		expect(isUnnamed).toBe(false);

		// Subsequent terminal title changes are ignored
		renameUnnamedWorkspace("user@host:~/projects/my-app", false);
		expect(workspaceName).toBe("Claude Code"); // not overwritten
		expect(isUnnamed).toBe(false);

		renameUnnamedWorkspace("vim README.md", false);
		expect(workspaceName).toBe("Claude Code"); // still stable
	});
});
