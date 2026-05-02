import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { writeAttachment } from "../../../attachments/storage";
import { resolveAttachmentFiles } from "./resolve-attachment-files";

describe("resolveAttachmentFiles", () => {
	let baseDir: string;
	let prevEnv: string | undefined;

	beforeEach(() => {
		baseDir = mkdtempSync(join(tmpdir(), "resolve-attachments-"));
		prevEnv = process.env.HOST_MANIFEST_DIR;
		process.env.HOST_MANIFEST_DIR = baseDir;
	});
	afterEach(() => {
		if (prevEnv === undefined) delete process.env.HOST_MANIFEST_DIR;
		else process.env.HOST_MANIFEST_DIR = prevEnv;
		rmSync(baseDir, { recursive: true, force: true });
	});

	it("returns an empty array when no ids are passed", () => {
		expect(resolveAttachmentFiles([])).toEqual([]);
	});

	it("reads bytes + metadata for each stored attachment", () => {
		const id = crypto.randomUUID();
		writeAttachment(new Uint8Array([0x68, 0x69]), {
			attachmentId: id,
			mediaType: "text/plain",
			originalFilename: "hello.txt",
			sizeBytes: 2,
			createdAt: Date.now(),
		});

		const result = resolveAttachmentFiles([id]);
		expect(result).toHaveLength(1);
		expect(result[0]?.filename).toBe("hello.txt");
		expect(result[0]?.mediaType).toBe("text/plain");
		expect(Array.from(result[0]?.data ?? [])).toEqual([0x68, 0x69]);
	});

	it("skips ids whose data is missing on disk (degrades gracefully)", () => {
		const presentId = crypto.randomUUID();
		writeAttachment(new Uint8Array([0x00]), {
			attachmentId: presentId,
			mediaType: "application/octet-stream",
			sizeBytes: 1,
			createdAt: Date.now(),
		});

		const missingId = crypto.randomUUID();
		const result = resolveAttachmentFiles([missingId, presentId]);
		expect(result).toHaveLength(1);
		expect(result[0]?.filename).toBeUndefined();
	});
});
