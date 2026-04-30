import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HostServiceContext } from "../../../types";
import { attachmentsRouter } from "./attachments";
import { MAX_ATTACHMENT_BYTES } from "./constants";
import { getAttachmentDir, getAttachmentFilePath } from "./storage";

let tempBase: string;

beforeEach(() => {
	tempBase = mkdtempSync(join(tmpdir(), "superset-attachments-test-"));
	process.env.HOST_MANIFEST_DIR = tempBase;
});

afterEach(() => {
	rmSync(tempBase, { recursive: true, force: true });
	delete process.env.HOST_MANIFEST_DIR;
});

function createCaller() {
	const ctx = { isAuthenticated: true } as unknown as HostServiceContext;
	return attachmentsRouter.createCaller(ctx);
}

const PNG_BASE64 =
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("attachmentsRouter.upload", () => {
	it("writes bytes and metadata to disk under HOST_MANIFEST_DIR", async () => {
		const caller = createCaller();
		const result = await caller.upload({
			data: { kind: "base64", data: PNG_BASE64 },
			mediaType: "image/png",
			originalFilename: "pixel.png",
		});

		expect(result.attachmentId).toMatch(/^[0-9a-f-]{36}$/);
		expect(result.mediaType).toBe("image/png");
		expect(result.originalFilename).toBe("pixel.png");
		expect(result.sizeBytes).toBeGreaterThan(0);

		const filePath = getAttachmentFilePath(result.attachmentId, "image/png");
		const metaPath = join(
			getAttachmentDir(result.attachmentId),
			"metadata.json",
		);
		expect(existsSync(filePath)).toBe(true);
		expect(existsSync(metaPath)).toBe(true);

		const metadata = JSON.parse(readFileSync(metaPath, "utf8"));
		expect(metadata.attachmentId).toBe(result.attachmentId);
		expect(metadata.mediaType).toBe("image/png");
		expect(metadata.originalFilename).toBe("pixel.png");
		expect(metadata.sizeBytes).toBe(result.sizeBytes);
		expect(typeof metadata.createdAt).toBe("number");
	});

	it("uses the right extension for known MIME types", async () => {
		const caller = createCaller();
		const cases: Array<[string, string]> = [
			["text/plain", ".txt"],
			["application/pdf", ".pdf"],
			["image/jpeg", ".jpg"],
			["application/json", ".json"],
		];
		for (const [mediaType, expectedExt] of cases) {
			const result = await caller.upload({
				data: {
					kind: "base64",
					data: Buffer.from("payload").toString("base64"),
				},
				mediaType,
			});
			const filePath = getAttachmentFilePath(result.attachmentId, mediaType);
			expect(filePath).toMatch(new RegExp(`${expectedExt}$`));
			expect(existsSync(filePath)).toBe(true);
		}
	});

	it("rejects unrecognized media type", async () => {
		const caller = createCaller();
		await expect(
			caller.upload({
				data: { kind: "base64", data: PNG_BASE64 },
				mediaType: "application/x-totally-fake",
			}),
		).rejects.toThrow(/unrecognized media type/i);
	});

	it("rejects empty payload", async () => {
		const caller = createCaller();
		await expect(
			caller.upload({
				data: { kind: "base64", data: "AA==" }, // base64 of [0x00], not empty after decode
				mediaType: "image/png",
			}),
		).resolves.toBeDefined();
		// And actually-empty base64 fails schema (min(1)):
		await expect(
			caller.upload({
				// biome-ignore lint/suspicious/noExplicitAny: testing invalid input
				data: { kind: "base64", data: "" } as any,
				mediaType: "image/png",
			}),
		).rejects.toThrow();
	});

	it("rejects oversized payload", async () => {
		const caller = createCaller();
		const big = Buffer.alloc(MAX_ATTACHMENT_BYTES + 1, 0x42);
		await expect(
			caller.upload({
				data: { kind: "base64", data: big.toString("base64") },
				mediaType: "application/octet-stream",
			}),
		).rejects.toThrow(/exceeds/i);
	});

	it("assigns a unique id per upload", async () => {
		const caller = createCaller();
		const a = await caller.upload({
			data: { kind: "base64", data: PNG_BASE64 },
			mediaType: "image/png",
		});
		const b = await caller.upload({
			data: { kind: "base64", data: PNG_BASE64 },
			mediaType: "image/png",
		});
		expect(a.attachmentId).not.toBe(b.attachmentId);
	});
});

describe("attachmentsRouter.delete", () => {
	it("removes the attachment directory", async () => {
		const caller = createCaller();
		const uploaded = await caller.upload({
			data: { kind: "base64", data: PNG_BASE64 },
			mediaType: "image/png",
		});
		const dir = getAttachmentDir(uploaded.attachmentId);
		expect(existsSync(dir)).toBe(true);

		const result = await caller.delete({ attachmentId: uploaded.attachmentId });

		expect(result.success).toBe(true);
		expect(existsSync(dir)).toBe(false);
	});

	it("is idempotent for unknown id", async () => {
		const caller = createCaller();
		const result = await caller.delete({
			attachmentId: "00000000-0000-0000-0000-000000000000",
		});
		expect(result.success).toBe(true);
	});

	it("rejects non-UUID id (path traversal guard)", async () => {
		const caller = createCaller();
		await expect(
			caller.delete({ attachmentId: "../../etc/passwd" }),
		).rejects.toThrow();
	});
});
