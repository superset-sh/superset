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

		await writer.init();
		writer.write("Hello, World!\n");
		writer.write("Line 2\n");
		writer.write("Line 3");
		await writer.close(0);

		const reader = new HistoryReader(testWorkspaceId, testTabId);
		const result = await reader.read();

		expect(result.scrollback).toBe("Hello, World!\nLine 2\nLine 3");
	});

	it("should write metadata with exit code", async () => {
		const writer = new HistoryWriter(
			testWorkspaceId,
			testTabId,
			"/test/cwd",
			120,
			40,
		);

		await writer.init();
		writer.write("Some output");
		await writer.close(42);

		const reader = new HistoryReader(testWorkspaceId, testTabId);
		const result = await reader.read();

		expect(result.metadata?.cwd).toBe("/test/cwd");
		expect(result.metadata?.cols).toBe(120);
		expect(result.metadata?.rows).toBe(40);
		expect(result.metadata?.exitCode).toBe(42);
		expect(result.metadata?.startedAt).toBeDefined();
		expect(result.metadata?.endedAt).toBeDefined();
	});

	it("should preserve initial scrollback and append new data", async () => {
		// First session
		const writer1 = new HistoryWriter(
			testWorkspaceId,
			testTabId,
			"/test/cwd",
			80,
			24,
		);
		await writer1.init();
		writer1.write("First session");
		await writer1.close(0);

		// Second session - recover and append
		const reader1 = new HistoryReader(testWorkspaceId, testTabId);
		const recovered = await reader1.read();

		const writer2 = new HistoryWriter(
			testWorkspaceId,
			testTabId,
			"/test/cwd",
			80,
			24,
		);
		await writer2.init(recovered.scrollback);
		writer2.write(" + Second session");
		await writer2.close(0);

		const reader2 = new HistoryReader(testWorkspaceId, testTabId);
		const result = await reader2.read();

		expect(result.scrollback).toBe("First session + Second session");
	});

	it("should preserve ANSI escape codes", async () => {
		const writer = new HistoryWriter(
			testWorkspaceId,
			testTabId,
			"/test/cwd",
			80,
			24,
		);

		// ANSI codes for colors, cursor movement, etc.
		const ansiData =
			"\x1b[32mGreen text\x1b[0m\r\n\x1b[1;34mBold blue\x1b[0m\x1b[2J\x1b[H";

		await writer.init();
		writer.write(ansiData);
		await writer.close(0);

		const reader = new HistoryReader(testWorkspaceId, testTabId);
		const result = await reader.read();

		expect(result.scrollback).toBe(ansiData);
	});

	it("should handle many small writes", async () => {
		const writer = new HistoryWriter(
			testWorkspaceId,
			testTabId,
			"/test/cwd",
			80,
			24,
		);

		await writer.init();

		// Simulate terminal output - many small chunks
		const chunks = [];
		for (let i = 0; i < 100; i++) {
			const chunk = `line ${i}\r\n`;
			chunks.push(chunk);
			writer.write(chunk);
		}
		await writer.close(0);

		const reader = new HistoryReader(testWorkspaceId, testTabId);
		const result = await reader.read();

		expect(result.scrollback).toBe(chunks.join(""));
	});

	it("should handle binary-like terminal data", async () => {
		const writer = new HistoryWriter(
			testWorkspaceId,
			testTabId,
			"/test/cwd",
			80,
			24,
		);

		// Mix of printable, control chars, and unicode
		const binaryLikeData =
			"Hello\x00World\x1b[31m红色\x1b[0m\t\r\n\x07Bell🔔";

		await writer.init();
		writer.write(binaryLikeData);
		await writer.close(0);

		const reader = new HistoryReader(testWorkspaceId, testTabId);
		const result = await reader.read();

		expect(result.scrollback).toBe(binaryLikeData);
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
		await writer.init();
		writer.write(largeData);
		await writer.close(0);

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
		await writer.init();
		writer.write("Test data");
		await writer.close(0);

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
