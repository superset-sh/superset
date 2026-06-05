import { describe, expect, test } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: test file needs fs/path to verify wiring in PromptGroup.tsx
import { readFileSync } from "node:fs";
// biome-ignore lint/style/noRestrictedImports: test file needs fs/path to verify wiring in PromptGroup.tsx
import { join } from "node:path";
import { resolveNewWorkspaceShortcut } from "./resolveNewWorkspaceShortcut";

// Build a minimal keyboard-event-like object. The keyboard helpers only read a
// handful of fields, and resolveNewWorkspaceShortcut additionally reads `code`
// and `altKey`, so a plain object is sufficient (no DOM in bun:test).
const ev = (partial: {
	key?: string;
	code?: string;
	metaKey?: boolean;
	ctrlKey?: boolean;
	shiftKey?: boolean;
	altKey?: boolean;
	isComposing?: boolean;
	keyCode?: number;
}): KeyboardEvent =>
	({
		key: partial.key ?? "",
		code: partial.code ?? "",
		metaKey: partial.metaKey ?? false,
		ctrlKey: partial.ctrlKey ?? false,
		shiftKey: partial.shiftKey ?? false,
		altKey: partial.altKey ?? false,
		isComposing: partial.isComposing ?? false,
		keyCode: partial.keyCode ?? 0,
	}) as unknown as KeyboardEvent;

// Issue #5149: while the new-workspace modal is open there was no keyboard
// shortcut to open the attach-reference popovers (GitHub issue / PR) — only the
// click-only AttachmentButtons. The only keyboard handler was Cmd/Ctrl+Enter to
// create. These tests pin down the new keyboard affordance.
describe("resolveNewWorkspaceShortcut", () => {
	test("Cmd+Enter and Ctrl+Enter still submit (create)", () => {
		expect(
			resolveNewWorkspaceShortcut(ev({ key: "Enter", metaKey: true })),
		).toBe("create");
		expect(
			resolveNewWorkspaceShortcut(ev({ key: "Enter", ctrlKey: true })),
		).toBe("create");
	});

	test("Cmd/Ctrl+I opens the GitHub issue picker", () => {
		expect(
			resolveNewWorkspaceShortcut(
				ev({ key: "i", code: "KeyI", metaKey: true }),
			),
		).toBe("open-github-issue");
		expect(
			resolveNewWorkspaceShortcut(
				ev({ key: "i", code: "KeyI", ctrlKey: true }),
			),
		).toBe("open-github-issue");
	});

	test("Cmd/Ctrl+P opens the PR picker", () => {
		expect(
			resolveNewWorkspaceShortcut(
				ev({ key: "p", code: "KeyP", metaKey: true }),
			),
		).toBe("open-pr");
		expect(
			resolveNewWorkspaceShortcut(
				ev({ key: "p", code: "KeyP", ctrlKey: true }),
			),
		).toBe("open-pr");
	});

	test("matches the physical key regardless of layout (uses code, not key)", () => {
		// On some non-QWERTY layouts the physical "I" key reports a different
		// `key`; the binding must follow `code`.
		expect(
			resolveNewWorkspaceShortcut(
				ev({ key: "ł", code: "KeyI", metaKey: true }),
			),
		).toBe("open-github-issue");
	});

	test("does nothing without a modifier", () => {
		expect(
			resolveNewWorkspaceShortcut(ev({ key: "i", code: "KeyI" })),
		).toBeNull();
		expect(
			resolveNewWorkspaceShortcut(ev({ key: "p", code: "KeyP" })),
		).toBeNull();
		expect(resolveNewWorkspaceShortcut(ev({ key: "Enter" }))).toBeNull();
	});

	test("leaves Shift/Alt combos for other handlers", () => {
		expect(
			resolveNewWorkspaceShortcut(
				ev({ key: "p", code: "KeyP", metaKey: true, shiftKey: true }),
			),
		).toBeNull();
		expect(
			resolveNewWorkspaceShortcut(
				ev({ key: "i", code: "KeyI", ctrlKey: true, altKey: true }),
			),
		).toBeNull();
	});

	test("ignores IME composition", () => {
		expect(
			resolveNewWorkspaceShortcut(
				ev({ key: "i", code: "KeyI", metaKey: true, isComposing: true }),
			),
		).toBeNull();
	});
});

// Guard that the modal actually wires the resolver into its global keydown
// handler and routes the picker actions to the popover open-state setters.
// Without this, the pure helper above could pass while the modal ignored it.
describe("PromptGroup wires resolveNewWorkspaceShortcut", () => {
	const source = readFileSync(
		join(import.meta.dir, "..", "..", "PromptGroup.tsx"),
		"utf8",
	);

	test("the keydown handler uses resolveNewWorkspaceShortcut", () => {
		expect(source).toContain("resolveNewWorkspaceShortcut");
	});

	test("the open-github-issue action opens the issue picker", () => {
		expect(source).toMatch(
			/open-github-issue[\s\S]*?setGitHubIssueLinkOpen\(true\)/,
		);
	});

	test("the open-pr action opens the PR picker", () => {
		expect(source).toMatch(/open-pr[\s\S]*?setPRLinkOpen\(true\)/);
	});
});
