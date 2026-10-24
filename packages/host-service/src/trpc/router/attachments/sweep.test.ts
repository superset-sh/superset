import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type AttachmentMetadata,
	getAttachmentDir,
	handOutAttachment,
	handOutAttachmentByFileId,
	indexAttachmentFileId,
	readAttachmentMetadata,
	writeAttachment,
} from "./storage";
import { sweepAttachmentStore } from "./sweep";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.now() - 365 * DAY_MS;

let base: string;

beforeEach(() => {
	base = mkdtempSync(join(tmpdir(), "superset-attachment-sweep-"));
});

afterEach(() => {
	rmSync(base, { recursive: true, force: true });
});

function seed(fields: Partial<AttachmentMetadata> = {}): AttachmentMetadata {
	const metadata: AttachmentMetadata = {
		attachmentId: crypto.randomUUID(),
		mediaType: "image/png",
		sizeBytes: 1,
		createdAt: NOW - 90 * DAY_MS,
		...fields,
	};
	writeAttachment(new Uint8Array([1]), metadata, base);
	return metadata;
}

const sweep = () =>
	sweepAttachmentStore({ now: NOW, retentionDays: 30, baseDirOverride: base });

describe("sweepAttachmentStore", () => {
	it("removes an entry unused past retention and keeps a recent one", async () => {
		const stale = seed({ lastUsedAt: NOW - 31 * DAY_MS });
		const recent = seed({ lastUsedAt: NOW - 29 * DAY_MS });

		expect((await sweep()).removed).toEqual([stale.attachmentId]);
		expect(existsSync(getAttachmentDir(stale.attachmentId, base))).toBe(false);
		expect(existsSync(getAttachmentDir(recent.attachmentId, base))).toBe(true);
	});

	it("stamps an entry from before lastUsedAt instead of removing it", async () => {
		const unstamped = seed();

		expect((await sweep()).removed).toEqual([]);
		expect(
			readAttachmentMetadata(unstamped.attachmentId, base)?.lastUsedAt,
		).toBe(NOW);
	});

	it("keeps an entry handed out after the pass started", async () => {
		const stale = seed({ lastUsedAt: NOW - 31 * DAY_MS });

		const pass = sweep();
		expect(handOutAttachment(stale.attachmentId, base)).not.toBeNull();

		expect((await pass).removed).toEqual([]);
		expect(existsSync(getAttachmentDir(stale.attachmentId, base))).toBe(true);
	});

	it("drops the fileId lookup with the entry it pointed to", async () => {
		const fileId = crypto.randomUUID();
		const stale = seed({ fileId, lastUsedAt: NOW - 31 * DAY_MS });
		indexAttachmentFileId({ ...stale, fileId }, base);

		await sweep();
		expect(handOutAttachmentByFileId(fileId, base)).toBeNull();
	});
});

describe("handOutAttachment", () => {
	it("stamps the entry it hands out", () => {
		const entry = seed({ lastUsedAt: NOW - 31 * DAY_MS });
		const handed = handOutAttachment(entry.attachmentId, base);
		expect(handed?.metadata.lastUsedAt).toBeGreaterThan(NOW);
		expect(
			readAttachmentMetadata(entry.attachmentId, base)?.lastUsedAt,
		).toBeGreaterThan(NOW);
	});

	it("finds a cloud copy by its fileId and stamps it", () => {
		const fileId = crypto.randomUUID();
		const entry = seed({ fileId, lastUsedAt: NOW - 31 * DAY_MS });
		indexAttachmentFileId({ ...entry, fileId }, base);

		const handed = handOutAttachmentByFileId(fileId, base);
		expect(handed?.metadata.attachmentId).toBe(entry.attachmentId);
		expect(handed?.metadata.lastUsedAt).toBeGreaterThan(NOW);
		expect(handOutAttachmentByFileId(crypto.randomUUID(), base)).toBeNull();
	});
});
