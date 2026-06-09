import { describe, expect, test } from "bun:test";
import {
	getFileManagerName,
	getOpenInFileManagerLabel,
	getRevealInFileManagerLabel,
	normalizeFileManagerPlatform,
} from "./file-manager-labels";

describe("file manager labels", () => {
	test("normalizes renderer and Node-style platform strings", () => {
		expect(normalizeFileManagerPlatform("Win32")).toBe("win32");
		expect(normalizeFileManagerPlatform("MacIntel")).toBe("darwin");
		expect(normalizeFileManagerPlatform("darwin")).toBe("darwin");
		expect(normalizeFileManagerPlatform("Linux x86_64")).toBe("linux");
		expect(normalizeFileManagerPlatform("FreeBSD")).toBe("unknown");
	});

	test("uses platform-specific file manager names", () => {
		expect(getFileManagerName("Win32")).toBe("File Explorer");
		expect(getFileManagerName("MacIntel")).toBe("Finder");
		expect(getFileManagerName("Linux x86_64")).toBe("Files");
	});

	test("builds action labels from the platform-specific name", () => {
		expect(getOpenInFileManagerLabel("Win32")).toBe("Open in File Explorer");
		expect(getRevealInFileManagerLabel("Win32")).toBe(
			"Reveal in File Explorer",
		);
		expect(getOpenInFileManagerLabel("MacIntel")).toBe("Open in Finder");
	});
});
