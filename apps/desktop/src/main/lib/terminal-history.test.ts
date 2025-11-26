import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { promises as fs } from "node:fs";
import {
	getHistoryDir,
	HistoryReader,
	HistoryWriter,
} from "./terminal-history";

describe("HistoryWriter", () => {
	const testWorkspaceId = "test-workspace";
	const testTabId = "test-tab";
	let historyDir: string;

	beforeEach(async () => {
		historyDir = getHistoryDir(testWorkspaceId, testTabId);
		try {
			await fs.rm(historyDir, { recursive: true, force: true });
		} catch {
			// Ignore if doesn't exist
		}
	});

	afterEach(async () => {
		try {
			await fs.rm(historyDir, { recursive: true, force: true });
		} catch {
			// Ignore if doesn't exist
		}
	});

	it("should write scrollback to file", async () => {
		const writer = new HistoryWriter(
			testWorkspaceId,
			testTabId,
			"/test/cwd",
			80,
			24,
		);

		const testData = "Hello, World!\nLine 2\nLine 3";
		await writer.write(testData, 0);

		const reader = new HistoryReader(testWorkspaceId, testTabId);
		const result = await reader.read();

		expect(result.scrollback).toBe(testData);
	});

	it("should write metadata with exit code", async () => {
		const writer = new HistoryWriter(
			testWorkspaceId,
			testTabId,
			"/test/cwd",
			120,
			40,
		);

		await writer.write("Some output", 42);

		const reader = new HistoryReader(testWorkspaceId, testTabId);
		const result = await reader.read();

		expect(result.metadata?.cwd).toBe("/test/cwd");
		expect(result.metadata?.cols).toBe(120);
		expect(result.metadata?.rows).toBe(40);
		expect(result.metadata?.exitCode).toBe(42);
		expect(result.metadata?.startedAt).toBeDefined();
		expect(result.metadata?.endedAt).toBeDefined();
	});

	it("should overwrite previous history", async () => {
		const writer1 = new HistoryWriter(
			testWorkspaceId,
			testTabId,
			"/test/cwd",
			80,
			24,
		);
		await writer1.write("First session", 0);

		const writer2 = new HistoryWriter(
			testWorkspaceId,
			testTabId,
			"/test/cwd",
			80,
			24,
		);
		await writer2.write("Second session", 0);

		const reader = new HistoryReader(testWorkspaceId, testTabId);
		const result = await reader.read();

		expect(result.scrollback).toBe("Second session");
		expect(result.scrollback).not.toContain("First session");
	});
});

describe("HistoryReader", () => {
	const testWorkspaceId = "test-workspace-reader";
	const testTabId = "test-tab-reader";
	let historyDir: string;

	beforeEach(async () => {
		historyDir = getHistoryDir(testWorkspaceId, testTabId);
		try {
			await fs.rm(historyDir, { recursive: true, force: true });
		} catch {
			// Ignore if doesn't exist
		}
	});

	afterEach(async () => {
		try {
			await fs.rm(historyDir, { recursive: true, force: true });
		} catch {
			// Ignore if doesn't exist
		}
	});

	it("should return empty scrollback for non-existent history", async () => {
		const reader = new HistoryReader(testWorkspaceId, testTabId);
		const result = await reader.read();

		expect(result.scrollback).toBe("");
		expect(result.metadata).toBeUndefined();
	});

	it("should read entire scrollback without truncation", async () => {
		const writer = new HistoryWriter(
			testWorkspaceId,
			testTabId,
			"/test/cwd",
			80,
			24,
		);

		// Write 200KB of data
		const largeData = "X".repeat(200000);
		await writer.write(largeData, 0);

		const reader = new HistoryReader(testWorkspaceId, testTabId);
		const result = await reader.read();

		// Should return the entire scrollback
		expect(result.scrollback.length).toBe(200000);
		expect(result.scrollback).toBe(largeData);
	});

	it("should cleanup history directory completely", async () => {
		const writer = new HistoryWriter(
			testWorkspaceId,
			testTabId,
			"/test/cwd",
			80,
			24,
		);
		await writer.write("Test data", 0);

		// Verify files exist
		expect(await fs.stat(historyDir)).toBeDefined();

		// Cleanup
		const reader = new HistoryReader(testWorkspaceId, testTabId);
		await reader.cleanup();

		// Verify directory is gone
		try {
			await fs.stat(historyDir);
			throw new Error("Directory should not exist");
		} catch (error) {
			// @ts-expect-error
			expect(error.code).toBe("ENOENT");
		}
	});
});
