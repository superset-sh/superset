import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	encodeProjectDirName,
	readLatestColorAndTitle,
	resolveTranscriptPath,
} from "./claude-transcript";

describe("encodeProjectDirName", () => {
	it("replaces every non-alphanumeric character 1:1 with a dash", () => {
		expect(
			encodeProjectDirName(
				"/Users/moshef/.superset/worktrees/4c931ee0/session-start",
			),
		).toBe("-Users-moshef--superset-worktrees-4c931ee0-session-start");
	});
});

describe("resolveTranscriptPath", () => {
	it("joins the encoded cwd and sessionId under ~/.claude/projects", () => {
		const path = resolveTranscriptPath("/Users/moshef/repo", "abc-123");
		expect(
			path.endsWith(".claude/projects/-Users-moshef-repo/abc-123.jsonl"),
		).toBe(true);
	});
});

describe("readLatestColorAndTitle", () => {
	let dir: string;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "claude-transcript-test-"));
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	it("returns {} when the file doesn't exist", () => {
		expect(readLatestColorAndTitle(join(dir, "missing.jsonl"))).toEqual({});
	});

	it("returns {} for an empty file", () => {
		const path = join(dir, "empty.jsonl");
		writeFileSync(path, "");
		expect(readLatestColorAndTitle(path)).toEqual({});
	});

	it("ignores malformed lines and unrelated entry types", () => {
		const path = join(dir, "malformed.jsonl");
		writeFileSync(
			path,
			[
				"not json at all",
				JSON.stringify({ type: "user", message: "hi" }),
				"",
			].join("\n"),
		);
		expect(readLatestColorAndTitle(path)).toEqual({});
	});

	it("returns the most recent agent-color and ai-title lines", () => {
		const path = join(dir, "session.jsonl");
		writeFileSync(
			path,
			[
				JSON.stringify({ type: "agent-color", agentColor: "red" }),
				JSON.stringify({ type: "ai-title", aiTitle: "First title" }),
				JSON.stringify({ type: "user", message: "hi" }),
				JSON.stringify({ type: "agent-color", agentColor: "yellow" }),
				JSON.stringify({ type: "ai-title", aiTitle: "Second title" }),
				"",
			].join("\n"),
		);
		expect(readLatestColorAndTitle(path)).toEqual({
			color: "yellow",
			title: "Second title",
		});
	});

	it("returns only the field type present when the other never appeared", () => {
		const path = join(dir, "color-only.jsonl");
		writeFileSync(
			path,
			`${JSON.stringify({ type: "agent-color", agentColor: "blue" })}\n`,
		);
		expect(readLatestColorAndTitle(path)).toEqual({ color: "blue" });
	});

	it("reads a user-set title from a custom-title line", () => {
		const path = join(dir, "custom-title.jsonl");
		writeFileSync(
			path,
			[
				JSON.stringify({ type: "agent-color", agentColor: "red" }),
				JSON.stringify({ type: "custom-title", customTitle: "my session" }),
				JSON.stringify({ type: "agent-name", agentName: "my session" }),
				"",
			].join("\n"),
		);
		expect(readLatestColorAndTitle(path)).toEqual({
			color: "red",
			title: "my session",
		});
	});
});
