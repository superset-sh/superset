import { describe, expect, test } from "bun:test";
import {
	getImageExtensionFromMimeType,
	getImageMimeType,
	getVideoMimeType,
	isImageFile,
	isPreviewableVideoFile,
	isVideoFile,
	parseBase64DataUrl,
} from "./file-types";

const PNG_BASE64 = Buffer.from("png").toString("base64");

describe("file-types", () => {
	test("maps image file paths to MIME types", () => {
		expect(getImageMimeType("logo.svg")).toBe("image/svg+xml");
		expect(getImageMimeType("logo.ico")).toBe("image/x-icon");
		expect(getImageMimeType("logo.tiff")).toBe("image/tiff");
		expect(getImageMimeType("logo.unknown")).toBeNull();
	});

	test("detects supported image file paths", () => {
		expect(isImageFile("sample.bmp")).toBe(true);
		expect(isImageFile("sample.tiff")).toBe(true);
		expect(isImageFile("sample.txt")).toBe(false);
	});

	test("maps image MIME types to preferred extensions", () => {
		expect(getImageExtensionFromMimeType("image/jpeg")).toBe("jpg");
		expect(getImageExtensionFromMimeType("image/vnd.microsoft.icon")).toBe(
			"ico",
		);
		expect(getImageExtensionFromMimeType("image/webp")).toBe("webp");
		expect(getImageExtensionFromMimeType("image/avif")).toBeNull();
	});

	test("detects supported video file paths", () => {
		expect(isVideoFile("demo.mp4")).toBe(true);
		expect(isVideoFile("clips/intro.webm")).toBe(true);
		expect(isVideoFile("clips/INTRO.MOV")).toBe(true);
		expect(isVideoFile("clips/intro.avi")).toBe(true);
		expect(isVideoFile("clips/intro.mkv")).toBe(true);
		expect(isVideoFile("archive.zip")).toBe(false);
	});

	test("detects browser-previewable video file paths", () => {
		expect(isPreviewableVideoFile("demo.mp4")).toBe(true);
		expect(isPreviewableVideoFile("demo.webm")).toBe(true);
		expect(isPreviewableVideoFile("demo.avi")).toBe(false);
		expect(isPreviewableVideoFile("demo.mkv")).toBe(false);
	});

	test("maps video file paths to MIME types", () => {
		expect(getVideoMimeType("demo.mp4")).toBe("video/mp4");
		expect(getVideoMimeType("demo.webm")).toBe("video/webm");
		expect(getVideoMimeType("demo.mov")).toBe("video/quicktime");
		expect(getVideoMimeType("demo.avi")).toBeNull();
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
