import { describe, expect, it } from "bun:test";
import {
	assignAttachmentFileName,
	attachmentFallbackName,
	attachmentNameWithSuffix,
	sanitizeAttachmentFileName,
} from "./workspace-attachments";

describe("sanitizeAttachmentFileName", () => {
	it("keeps safe names and replaces hostile characters", () => {
		expect(sanitizeAttachmentFileName("image.png")).toBe("image.png");
		expect(sanitizeAttachmentFileName("../shot: 1/final.png")).toBe(
			".._shot__1_final.png",
		);
	});

	it("returns null when nothing usable survives", () => {
		expect(sanitizeAttachmentFileName("!!!")).toBe("___");
		expect(sanitizeAttachmentFileName("   ")).toBe("___");
		expect(sanitizeAttachmentFileName("")).toBeNull();
		expect(sanitizeAttachmentFileName(undefined)).toBeNull();
		expect(sanitizeAttachmentFileName(null)).toBeNull();
	});

	it("rejects names that resolve to the directory or its parent", () => {
		expect(sanitizeAttachmentFileName(".")).toBeNull();
		expect(sanitizeAttachmentFileName("..")).toBeNull();
		// "..." is a legal (if odd) filename — only the two specials are out.
		expect(sanitizeAttachmentFileName("...")).toBe("...");
	});
});

describe("attachmentNameWithSuffix", () => {
	it("returns the base unchanged for attempt 0", () => {
		expect(attachmentNameWithSuffix("image.png", 0)).toBe("image.png");
	});

	it("suffixes before the last extension", () => {
		expect(attachmentNameWithSuffix("image.png", 1)).toBe("image_1.png");
		expect(attachmentNameWithSuffix("a.b.png", 2)).toBe("a.b_2.png");
	});

	it("appends for extensionless and dotfile names", () => {
		expect(attachmentNameWithSuffix("Makefile", 1)).toBe("Makefile_1");
		expect(attachmentNameWithSuffix(".bashrc", 1)).toBe(".bashrc_1");
	});
});

describe("attachmentFallbackName", () => {
	it("is 1-based and takes an optional dotted extension", () => {
		expect(attachmentFallbackName(0)).toBe("attachment_1");
		expect(attachmentFallbackName(2, ".png")).toBe("attachment_3.png");
	});
});

describe("assignAttachmentFileName", () => {
	it("is deterministic across two independent passes over the same list", () => {
		// The load-bearing property: the file writer and the prompt renderer
		// run this separately and must agree on every name.
		const list = [
			{ rawName: "image.png" },
			{ rawName: "image.png" },
			{ rawName: undefined },
			{ rawName: "!!!" },
			{ rawName: "notes.pdf" },
		];
		const assign = () => {
			const used = new Set<string>();
			return list.map((item, index) =>
				assignAttachmentFileName({ ...item, index, used }),
			);
		};
		const first = assign();
		expect(first).toEqual([
			"image.png",
			"image_1.png",
			"attachment_3",
			"___",
			"notes.pdf",
		]);
		expect(assign()).toEqual(first);
	});

	it("uses the fallback extension for generated names", () => {
		const used = new Set<string>();
		expect(
			assignAttachmentFileName({
				rawName: "",
				index: 0,
				used,
				fallbackExtension: ".png",
			}),
		).toBe("attachment_1.png");
	});

	it("dedupes case-insensitively — one path on APFS/NTFS", () => {
		const used = new Set<string>();
		expect(
			assignAttachmentFileName({ rawName: "image.png", index: 0, used }),
		).toBe("image.png");
		expect(
			assignAttachmentFileName({ rawName: "Image.png", index: 1, used }),
		).toBe("Image_1.png");
	});

	it("dedupes generated names that collide with real ones", () => {
		const used = new Set<string>();
		expect(
			assignAttachmentFileName({ rawName: "attachment_2", index: 0, used }),
		).toBe("attachment_2");
		expect(
			assignAttachmentFileName({ rawName: undefined, index: 1, used }),
		).toBe("attachment_2_1");
	});
});
