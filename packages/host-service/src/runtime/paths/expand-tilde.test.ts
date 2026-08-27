import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import { expandTildeAbsolute } from "./expand-tilde";

describe("expandTildeAbsolute", () => {
	test("expands bare ~ to the home directory", () => {
		expect(expandTildeAbsolute("~")).toBe(homedir());
	});

	test("expands ~/subpath against home", () => {
		expect(expandTildeAbsolute("~/dev/projects")).toBe(
			join(homedir(), "dev/projects"),
		);
	});

	test("passes absolute paths through normalized", () => {
		expect(expandTildeAbsolute("/tmp//x/../y")).toBe("/tmp/y");
	});

	test("trims surrounding whitespace", () => {
		expect(expandTildeAbsolute("  /tmp/x  ")).toBe("/tmp/x");
	});

	test("rejects relative paths", () => {
		expect(() => expandTildeAbsolute("dev/projects")).toThrow(
			"absolute or start with ~",
		);
	});

	test("rejects ~user forms rather than misresolving them", () => {
		expect(() => expandTildeAbsolute("~kietho/dev")).toThrow(
			"absolute or start with ~",
		);
	});
});
