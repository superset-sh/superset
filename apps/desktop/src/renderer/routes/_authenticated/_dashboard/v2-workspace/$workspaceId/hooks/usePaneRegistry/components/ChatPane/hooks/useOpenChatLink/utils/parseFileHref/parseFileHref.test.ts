import { expect, test } from "bun:test";
import { parseFileHref } from "./parseFileHref";

test("reads paths and line positions the way agents write them", () => {
	expect(parseFileHref("src/app.ts")).toEqual({ path: "src/app.ts" });
	expect(parseFileHref("src/app.ts:12")).toEqual({
		path: "src/app.ts",
		row: 12,
	});
	expect(parseFileHref("src/app.ts:12:3")).toEqual({
		path: "src/app.ts",
		row: 12,
		col: 3,
	});
	expect(parseFileHref("src/app.ts#L12")).toEqual({
		path: "src/app.ts",
		row: 12,
	});
	expect(parseFileHref("src/app.ts#L12-L20")).toEqual({
		path: "src/app.ts",
		row: 12,
	});
	expect(parseFileHref("/Users/me/repo/My%20File.ts")).toEqual({
		path: "/Users/me/repo/My File.ts",
	});
	expect(parseFileHref("file:///tmp/a.ts:4")).toEqual({
		path: "/tmp/a.ts",
		row: 4,
	});
	expect(parseFileHref("file://localhost/tmp/a.ts#L7")).toEqual({
		path: "/tmp/a.ts",
		row: 7,
	});
	expect(parseFileHref("package.json:12")).toEqual({
		path: "package.json",
		row: 12,
	});
	expect(parseFileHref("app.ts:12:3")).toEqual({
		path: "app.ts",
		row: 12,
		col: 3,
	});
	expect(parseFileHref("src/components/")).toEqual({ path: "src/components/" });
});

test("leaves links that are not paths to the browser", () => {
	expect(parseFileHref("https://github.com")).toBeNull();
	expect(parseFileHref("mailto:a@b.co")).toBeNull();
	expect(parseFileHref("tel:5551234")).toBeNull();
	expect(parseFileHref("file://server/share/a.ts")).toBeNull();
	expect(parseFileHref("#section")).toBeNull();
	expect(parseFileHref("")).toBeNull();
});
