import { describe, expect, test } from "bun:test";
import {
	getFileExtension,
	isBinaryMediaFile,
	isVideoFile,
} from "./media-files";

describe("media-files", () => {
	test("extracts lowercase extensions and ignores directory dots", () => {
		expect(getFileExtension("clips/INTRO.MOV")).toBe("mov");
		expect(getFileExtension("a.b.c/file.TS")).toBe("ts");
		expect(getFileExtension("noext")).toBe("");
		expect(getFileExtension(".gitignore")).toBe("");
		expect(getFileExtension("trailing.")).toBe("");
	});

	test("detects video files across container formats", () => {
		expect(isVideoFile("demo.mp4")).toBe(true);
		expect(isVideoFile("clips/intro.mkv")).toBe(true);
		expect(isVideoFile("archive.zip")).toBe(false);
	});

	test("flags raster images and videos as binary media", () => {
		expect(isBinaryMediaFile("logo.png")).toBe(true);
		expect(isBinaryMediaFile("photo.JPG")).toBe(true);
		expect(isBinaryMediaFile("demo.webm")).toBe(true);
		expect(isBinaryMediaFile("notes.txt")).toBe(false);
	});

	test("treats svg as text so its diff stays visible", () => {
		expect(isBinaryMediaFile("icon.svg")).toBe(false);
	});
});
