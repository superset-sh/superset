import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	HistoryReader,
	HistoryWriter,
	getHistoryDir,
	getHistoryFilePath,
	getMetadataPath,
	type SessionMetadata,
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

	it("should initialize with byteLength 0 for new session", async () => {
		const writer = new HistoryWriter(
			testWorkspaceId,
			testTabId,
			"/test/cwd",
			80,
			24,
		);

		await writer.init();

		const metaPath = getMetadataPath(testWorkspaceId, testTabId);
		const metaContent = await fs.readFile(metaPath, "utf-8");
		const metadata = JSON.parse(metaContent) as SessionMetadata;

		expect(metadata.byteLength).toBe(0);

		await writer.finalize();
	});

	it("should preserve byteLength across sessions", async () => {
		// Session 1: Write some data
		const writer1 = new HistoryWriter(
			testWorkspaceId,
			testTabId,
			"/test/cwd",
			80,
			24,
		);
		await writer1.init();

		const testData = "Hello, World!";
		writer1.writeData(testData);

		await writer1.finalize();

		// Verify metadata shows correct byteLength (file size after session 1)
		const metaPath = getMetadataPath(testWorkspaceId, testTabId);
		const meta1Content = await fs.readFile(metaPath, "utf-8");
		const meta1 = JSON.parse(meta1Content) as SessionMetadata;
		const session1ByteLength = meta1.byteLength;
		expect(session1ByteLength).toBeGreaterThan(0);

		// Session 2: Append more data
		const writer2 = new HistoryWriter(
			testWorkspaceId,
			testTabId,
			"/test/cwd",
			80,
			24,
		);
		await writer2.init();

		const moreData = "More output!";
		writer2.writeData(moreData);

		await writer2.finalize();

		// Verify byteLength is cumulative (includes both sessions)
		const meta2Content = await fs.readFile(metaPath, "utf-8");
		const meta2 = JSON.parse(meta2Content) as SessionMetadata;
		expect(meta2.byteLength).toBeGreaterThan(session1ByteLength);

		// Verify the file actually contains both sessions' data
		const historyPath = getHistoryFilePath(testWorkspaceId, testTabId);
		const fileContent = await fs.readFile(historyPath, "utf-8");
		expect(fileContent).toContain(Buffer.from(testData).toString("base64"));
		expect(fileContent).toContain(Buffer.from(moreData).toString("base64"));
	});

	it("should track byteLength correctly with multiple writes", async () => {
		const writer = new HistoryWriter(
			testWorkspaceId,
			testTabId,
			"/test/cwd",
			80,
			24,
		);
		await writer.init();

		const writes = ["First line\n", "Second line\n", "Third line\n"];

		for (const data of writes) {
			writer.writeData(data);
		}

		await writer.finalize();

		const metaPath = getMetadataPath(testWorkspaceId, testTabId);
		const metaContent = await fs.readFile(metaPath, "utf-8");
		const metadata = JSON.parse(metaContent) as SessionMetadata;

		// byteLength should track the history file size (NDJSON events), not raw data
		expect(metadata.byteLength).toBeGreaterThan(0);

		// Verify all writes are in the file
		const historyPath = getHistoryFilePath(testWorkspaceId, testTabId);
		const fileContent = await fs.readFile(historyPath, "utf-8");
		for (const data of writes) {
			expect(fileContent).toContain(Buffer.from(data).toString("base64"));
		}
	});

	it("should write exit events correctly", async () => {
		const writer = new HistoryWriter(
			testWorkspaceId,
			testTabId,
			"/test/cwd",
			80,
			24,
		);
		await writer.init();

		writer.writeData("Some output\n");
		await writer.writeExit(0);

		// Read history file and verify exit event
		const historyPath = getHistoryFilePath(testWorkspaceId, testTabId);
		const content = await fs.readFile(historyPath, "utf-8");
		const lines = content.trim().split("\n");

		const exitEvent = JSON.parse(lines[lines.length - 1]);
		expect(exitEvent.type).toBe("exit");
		expect(exitEvent.exitCode).toBe(0);
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
		const result = await reader.getLatestSession();

		expect(result.scrollback).toBe("");
		expect(result.wasRecovered).toBe(false);
	});

	it("should read history from file efficiently", async () => {
		// Create a large history file to test efficient reading
		const writer = new HistoryWriter(
			testWorkspaceId,
			testTabId,
			"/test/cwd",
			80,
			24,
		);
		await writer.init();

		// Write 200KB of data (should be reduced to 100KB when reading)
		const largeData = "X".repeat(1000); // 1KB per write
		for (let i = 0; i < 200; i++) {
			writer.writeData(largeData);
		}

		await writer.finalize();

		// Read history
		const reader = new HistoryReader(testWorkspaceId, testTabId);
		const result = await reader.getLatestSession();

		// Should cap at 100k chars
		expect(result.scrollback.length).toBeLessThanOrEqual(100000);
		expect(result.wasRecovered).toBe(true);
	});

	it("should only read from end of large files", async () => {
		// Create a very large history file to test tail reading optimization
		const writer = new HistoryWriter(
			testWorkspaceId,
			testTabId,
			"/test/cwd",
			80,
			24,
		);
		await writer.init();

		// Write 1MB of early data (should be skipped)
		const earlyData = "EARLY".repeat(1000);
		for (let i = 0; i < 200; i++) {
			writer.writeData(earlyData);
		}

		// Write distinctive data at the end
		const lateData = "LATE_DATA_MARKER";
		writer.writeData(lateData);

		await writer.finalize();

		// Read history
		const reader = new HistoryReader(testWorkspaceId, testTabId);
		const result = await reader.getLatestSession();

		// Should contain the late data marker
		expect(result.scrollback).toContain(lateData);
		expect(result.wasRecovered).toBe(true);
	});

	it("should handle malformed lines gracefully", async () => {
		// Write some data normally
		const writer = new HistoryWriter(
			testWorkspaceId,
			testTabId,
			"/test/cwd",
			80,
			24,
		);
		await writer.init();
		writer.writeData("Valid data\n");
		await writer.finalize();

		// Manually append malformed line
		const historyPath = getHistoryFilePath(testWorkspaceId, testTabId);
		await fs.appendFile(historyPath, "MALFORMED JSON LINE\n");

		// Should still read valid data without throwing
		const reader = new HistoryReader(testWorkspaceId, testTabId);
		const result = await reader.getLatestSession();

		expect(result.scrollback).toContain("Valid data");
		expect(result.wasRecovered).toBe(true);
	});

	it("should recover metadata along with scrollback", async () => {
		const testCwd = "/test/workspace/path";
		const testCols = 120;
		const testRows = 40;

		const writer = new HistoryWriter(
			testWorkspaceId,
			testTabId,
			testCwd,
			testCols,
			testRows,
		);
		await writer.init();
		writer.writeData("Test output\n");
		await writer.finalize(0);

		const reader = new HistoryReader(testWorkspaceId, testTabId);
		const result = await reader.getLatestSession();

		expect(result.wasRecovered).toBe(true);
		expect(result.metadata).toBeDefined();
		expect(result.metadata?.cwd).toBe(testCwd);
		expect(result.metadata?.cols).toBe(testCols);
		expect(result.metadata?.rows).toBe(testRows);
		expect(result.metadata?.exitCode).toBe(0);
	});
});

describe("Terminal history integration", () => {
	const testWorkspaceId = "integration-workspace";
	const testTabId = "integration-tab";
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

	it("should append across multiple sessions without data loss", async () => {
		const sessions = [
			{ data: "Session 1 output\n", exitCode: 0 },
			{ data: "Session 2 output\n", exitCode: 0 },
			{ data: "Session 3 output\n", exitCode: 1 },
		];

		// Write multiple sessions
		for (const session of sessions) {
			const writer = new HistoryWriter(
				testWorkspaceId,
				testTabId,
				"/test/cwd",
				80,
				24,
			);
			await writer.init();
			writer.writeData(session.data);
			await writer.writeExit(session.exitCode);
		}

		// Read back all sessions
		const reader = new HistoryReader(testWorkspaceId, testTabId);
		const result = await reader.getLatestSession();

		expect(result.wasRecovered).toBe(true);
		for (const session of sessions) {
			expect(result.scrollback).toContain(session.data.trim());
		}
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
		writer.writeData("Test data\n");
		await writer.finalize();

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
			// @ts-ignore
			expect(error.code).toBe("ENOENT");
		}
	});
});
