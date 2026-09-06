import { describe, expect, test } from "bun:test";
import { resolveLocalImagePath } from "./resolveLocalImagePath";

const posix = { documentDirectory: "/repo/docs", rootPath: "/repo" };
const noRoot = { documentDirectory: "/home/me/.claude/skills/x" };
const windows = { documentDirectory: "C:\\repo\\docs", rootPath: "C:\\repo" };

describe("resolveLocalImagePath", () => {
	test.each([
		["shot.png", "/repo/docs/shot.png"],
		["./img/shot.png", "/repo/docs/img/shot.png"],
		["../assets/logo.svg", "/repo/assets/logo.svg"],
		["../../../../etc/passwd", "/etc/passwd"],
		["/img/x.png", "/repo/img/x.png"],
		["my%20shot.png?raw=true#frag", "/repo/docs/my shot.png"],
		["file:///Users/me/a%20b.png", "/Users/me/a b.png"],
	])("resolves %s against the document and workspace", (source, expected) => {
		expect(resolveLocalImagePath(source, posix)).toBe(expected);
	});

	test("a leading slash is a filesystem path when there is no root", () => {
		expect(resolveLocalImagePath("/img/x.png", noRoot)).toBe("/img/x.png");
	});

	test.each([
		"//evil.local/share/x.png",
		"\\\\evil.local\\share\\x.png",
		"/\\evil.local\\share\\x.png",
		"file://evil.local/share/x.png",
	])("refuses UNC share %s", (source) => {
		expect(resolveLocalImagePath(source, posix)).toBeNull();
	});

	test.each([
		"https://example.com/a.png",
		"http://example.com/a.png",
		"data:image/png;base64,AAAA",
		"javascript:alert(1)",
		"C:foo.png",
		"",
		"   ",
	])("leaves non-file source %j to the caller", (source) => {
		expect(resolveLocalImagePath(source, posix)).toBeNull();
	});

	test.each([
		["shot.png", "C:\\repo\\docs\\shot.png"],
		["..\\assets\\logo.png", "C:\\repo\\assets\\logo.png"],
		["/img/x.png", "C:\\repo\\img\\x.png"],
		["D:\\other\\x.png", "D:\\other\\x.png"],
		["C:\\repo\\image.png?raw=true#top", "C:\\repo\\image.png"],
		["C:%5Crepo%5Cx.png", "C:\\repo\\x.png"],
		["file:///C:/Users/me/x.png", "C:\\Users\\me\\x.png"],
		["../../../../x.png", "C:\\x.png"],
	])("keeps Windows separators and drive roots for %s", (source, expected) => {
		expect(resolveLocalImagePath(source, windows)).toBe(expected);
	});
});
