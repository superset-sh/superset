import { describe, expect, test } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: test file needs fs access
import { readFileSync } from "node:fs";
// biome-ignore lint/style/noRestrictedImports: test file needs path resolution
import { resolve } from "node:path";

const CHAT_PANE_PATH = resolve(__dirname, "ChatPaneInterface.tsx");

describe("v2 ChatPaneInterface activity tracking", () => {
	const source = readFileSync(CHAT_PANE_PATH, "utf8");

	test("imports useUpdateLastActivityAt hook", () => {
		expect(source).toContain("useUpdateLastActivityAt");
	});

	test("calls updateLastActivityAt(workspaceId) after message send", () => {
		const calls = source.match(/updateLastActivityAt\(workspaceId\)/g);
		expect(calls).not.toBeNull();
		// Should appear in both the manual send and auto-launch send paths
		expect(calls?.length).toBeGreaterThanOrEqual(2);
	});
});
