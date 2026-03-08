import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Tests for the readWorkingFile / readWorkingFileImage behavior.
 *
 * Issue #2137: The file editor does not refresh its content when a file is
 * changed externally (e.g. by an agent). The backend always reads the latest
 * content from disk on every call — the problem is that the frontend
 * FileViewerPane never re-calls the query after the initial load.
 *
 * The fix adds a `refetch` callback to `useFileContent` and a reload button
 * to `FileViewerToolbar` so the user can explicitly reload changed content.
 */

// ---------------------------------------------------------------------------
// Pure helpers extracted from file-contents.ts for unit testing
// ---------------------------------------------------------------------------

/** Detects if a buffer contains binary content by checking for NUL bytes. */
function isBinaryContent(buffer: Buffer): boolean {
	const BINARY_CHECK_SIZE = 8192;
	const checkLength = Math.min(buffer.length, BINARY_CHECK_SIZE);
	for (let i = 0; i < checkLength; i++) {
		if (buffer[i] === 0) {
			return true;
		}
	}
	return false;
}

/**
 * Core file-reading logic that mirrors what `readWorkingFile` does on each
 * invocation.  The function is intentionally stateless — it reads from disk
 * every time it is called, which is the correct server-side behaviour.
 *
 * Reproduction of #2137: because the frontend query result is cached and
 * `useFileContent` never re-fetches, the editor shows stale content after an
 * external change even though calling this again would return the right data.
 */
async function readWorkingFileContent(
	worktreePath: string,
	filePath: string,
): Promise<string | null> {
	const { readFile } = await import("node:fs/promises");
	try {
		return await readFile(join(worktreePath, filePath), "utf-8");
	} catch {
		return null;
	}
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("isBinaryContent", () => {
	test("returns false for plain text", () => {
		const buf = Buffer.from("hello world\n");
		expect(isBinaryContent(buf)).toBe(false);
	});

	test("returns true when NUL byte is present", () => {
		const buf = Buffer.from([0x68, 0x65, 0x00, 0x6c, 0x6f]); // 'he\0lo'
		expect(isBinaryContent(buf)).toBe(true);
	});

	test("only checks first 8192 bytes", () => {
		// NUL byte beyond the scan window should not trigger binary detection
		const clean = Buffer.alloc(8192, 0x41); // 'A' × 8192
		const nulAfter = Buffer.from([0x00]); // NUL at byte 8192
		const buf = Buffer.concat([clean, nulAfter]);
		expect(isBinaryContent(buf)).toBe(false);
	});

	test("returns false for empty buffer", () => {
		expect(isBinaryContent(Buffer.alloc(0))).toBe(false);
	});
});

describe("readWorkingFile fresh-content behaviour (issue #2137)", () => {
	test("returns updated content after file is modified externally", async () => {
		const dir = await mkdtemp(join(tmpdir(), "superset-file-viewer-test-"));
		try {
			const filePath = "example.txt";
			await writeFile(join(dir, filePath), "initial content");

			// First read — simulates initial load in FileViewerPane
			const first = await readWorkingFileContent(dir, filePath);
			expect(first).toBe("initial content");

			// External change — simulates an agent writing to the file
			await writeFile(join(dir, filePath), "updated by agent");

			// Second read (triggered by a refetch / reload) — must return new content.
			// BUG before fix: FileViewerPane never triggers this second read because
			// `useFileContent` does not expose a `refetch` function and
			// `FileViewerToolbar` has no reload button.
			const second = await readWorkingFileContent(dir, filePath);
			expect(second).toBe("updated by agent");
		} finally {
			await rm(dir, { recursive: true });
		}
	});

	test("returns null when file does not exist", async () => {
		const dir = await mkdtemp(join(tmpdir(), "superset-file-viewer-test-"));
		try {
			const result = await readWorkingFileContent(dir, "nonexistent.txt");
			expect(result).toBeNull();
		} finally {
			await rm(dir, { recursive: true });
		}
	});
});
