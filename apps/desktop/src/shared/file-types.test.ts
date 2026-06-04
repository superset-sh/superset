import { describe, expect, test } from "bun:test";
import {
	getImageExtensionFromMimeType,
	getImageMimeType,
	parseBase64DataUrl,
} from "./file-types";

const PNG_BASE64 = Buffer.from("png").toString("base64");

describe("file-types", () => {
	test("maps image file paths to MIME types", () => {
		expect(getImageMimeType("logo.svg")).toBe("image/svg+xml");
		expect(getImageMimeType("logo.ico")).toBe("image/x-icon");
		expect(getImageMimeType("logo.unknown")).toBeNull();
	});

	test("maps image MIME types to preferred extensions", () => {
		expect(getImageExtensionFromMimeType("image/jpeg")).toBe("jpg");
		expect(getImageExtensionFromMimeType("image/vnd.microsoft.icon")).toBe(
			"ico",
		);
		expect(getImageExtensionFromMimeType("image/webp")).toBe("webp");
		expect(getImageExtensionFromMimeType("image/avif")).toBeNull();
	});

	test("parses base64 data URLs with extra MIME parameters", () => {
		expect(
			parseBase64DataUrl(
				`data:image/svg+xml;charset=utf-8;base64,${PNG_BASE64}`,
			),
		).toEqual({
			base64Data: PNG_BASE64,
			mimeType: "image/svg+xml",
		});
	});

	test("rejects malformed base64 data URLs", () => {
		expect(() => parseBase64DataUrl("not-a-data-url")).toThrow(
			"Invalid data URL format",
		);
	});
});
