import { describe, expect, it } from "bun:test";
import { basename, isImageMime } from "./FilePart.logic";

describe("isImageMime", () => {
	it("detects image mime types", () => {
		expect(isImageMime("image/png")).toBe(true);
		expect(isImageMime("image/jpeg")).toBe(true);
		expect(isImageMime("image/gif")).toBe(true);
		expect(isImageMime("image/webp")).toBe(true);
	});

	it("rejects non-image mime types", () => {
		expect(isImageMime("text/plain")).toBe(false);
		expect(isImageMime("application/pdf")).toBe(false);
		expect(isImageMime("")).toBe(false);
	});
});

describe("basename", () => {
	it("returns the final path segment for posix paths", () => {
		expect(
			basename(
				"/var/folders/dn/6w9qbvsd2lvcjsgpnm7d2nnm0000gn/T/TemporaryItems/NSIRD_screencaptureui_rlY4iO/Screenshot 2026-04-21 at 2.59.50 AM.png",
			),
		).toBe("Screenshot 2026-04-21 at 2.59.50 AM.png");
	});

	it("returns the final segment for windows-style paths", () => {
		expect(basename("C:\\Users\\me\\Documents\\thing.pdf")).toBe("thing.pdf");
	});

	it("pass-through for bare filenames", () => {
		expect(basename("notes.txt")).toBe("notes.txt");
	});

	it("returns empty for empty input", () => {
		expect(basename("")).toBe("");
	});
});
