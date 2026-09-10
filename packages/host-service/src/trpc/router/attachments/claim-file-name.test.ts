import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claimFileName } from "./attachments";

const cloud = (name: string) => ({
	fileId: "00000000-0000-0000-0000-000000000000",
	name,
	contentType: "image/jpeg",
	sizeBytes: 1,
	url: "http://example.invalid/",
});

let directory: string;

beforeEach(() => {
	directory = mkdtempSync(join(tmpdir(), "attachment-names-"));
});
afterEach(() => {
	rmSync(directory, { recursive: true, force: true });
});

const claim = (used: Set<string>, ...names: string[]) =>
	names.map((name, index) =>
		claimFileName({ attachment: cloud(name), index, used, directory }),
	);

describe("claimFileName", () => {
	it("keeps the picker's name when nothing is in the way", () => {
		expect(claim(new Set(), "diagram.png")).toEqual(["diagram.png"]);
	});

	it("suffixes a second file of the same name in one batch", () => {
		expect(claim(new Set(), "IMG_0006.jpg", "IMG_0006.jpg")).toEqual([
			"IMG_0006.jpg",
			"IMG_0006_1.jpg",
		]);
	});

	// The reason this exists: the batch-local helper cannot see disk, so an
	// earlier send's file would be silently overwritten by a later one.
	it("does not overwrite what an earlier send already wrote", () => {
		writeFileSync(join(directory, "IMG_0006.jpg"), "earlier");

		expect(claim(new Set(), "IMG_0006.jpg")).toEqual(["IMG_0006_1.jpg"]);
		expect(Bun.file(join(directory, "IMG_0006.jpg")).text()).resolves.toBe(
			"earlier",
		);
	});

	it("keeps walking past every name already on disk", () => {
		writeFileSync(join(directory, "notes.txt"), "");
		writeFileSync(join(directory, "notes_1.txt"), "");

		expect(claim(new Set(), "notes.txt")).toEqual(["notes_2.txt"]);
	});

	// A picker name is untrusted. Separators are what would let one escape the
	// attachments directory, and they do not survive.
	it("cannot escape the attachments directory", () => {
		const [claimed] = claim(new Set(), "../../etc/passwd");

		expect(claimed).toBe(".._.._etc_passwd");
		expect(join(directory, claimed as string)).toBe(
			join(directory, ".._.._etc_passwd"),
		);
	});

	it("falls back to a generated name when nothing usable survives", () => {
		expect(claim(new Set(), ".")).toEqual(["attachment_1"]);
	});
});
