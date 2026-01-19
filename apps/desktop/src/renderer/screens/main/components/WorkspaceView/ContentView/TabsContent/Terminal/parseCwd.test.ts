import { describe, expect, it } from "bun:test";
import { parseCwd } from "./parseCwd";

const ESC = "\x1b";
const BEL = "\x07";

describe("parseCwd", () => {
	describe("basic OSC 7 parsing", () => {
		it("should parse OSC 7 with BEL terminator", () => {
			const data = `${ESC}]7;file://hostname/Users/test/project${BEL}`;
			expect(parseCwd(data)).toBe("/Users/test/project");
		});

		it("should parse OSC 7 with ST terminator (ESC\\)", () => {
			const data = `${ESC}]7;file://hostname/Users/test/project${ESC}\\`;
			expect(parseCwd(data)).toBe("/Users/test/project");
		});

		it("should handle empty hostname", () => {
			const data = `${ESC}]7;file:///Users/test/project${BEL}`;
			expect(parseCwd(data)).toBe("/Users/test/project");
		});

		it("should return null when no OSC 7 sequence present", () => {
			expect(parseCwd("regular terminal output")).toBeNull();
		});

		it("should return null for empty string", () => {
			expect(parseCwd("")).toBeNull();
		});
	});

	describe("URL decoding", () => {
		it("should decode URL-encoded spaces", () => {
			const data = `${ESC}]7;file://host/Users/test/my%20project${BEL}`;
			expect(parseCwd(data)).toBe("/Users/test/my project");
		});

		it("should decode multiple special characters", () => {
			const data = `${ESC}]7;file://host/path%20with%20spaces%2Fand%2Fslashes${BEL}`;
			expect(parseCwd(data)).toBe("/path with spaces/and/slashes");
		});

		it("should handle already decoded paths", () => {
			const data = `${ESC}]7;file://host/simple/path${BEL}`;
			expect(parseCwd(data)).toBe("/simple/path");
		});
	});

	describe("multiple sequences", () => {
		it("should return the last (most recent) directory", () => {
			const data = [
				`${ESC}]7;file://host/first/dir${BEL}`,
				"some output",
				`${ESC}]7;file://host/second/dir${BEL}`,
				"more output",
				`${ESC}]7;file://host/third/dir${BEL}`,
			].join("");
			expect(parseCwd(data)).toBe("/third/dir");
		});

		it("should handle mixed terminators", () => {
			const data = [
				`${ESC}]7;file://host/first${BEL}`,
				`${ESC}]7;file://host/second${ESC}\\`,
			].join("");
			expect(parseCwd(data)).toBe("/second");
		});
	});

	describe("edge cases", () => {
		it("should handle root path", () => {
			const data = `${ESC}]7;file://host/${BEL}`;
			expect(parseCwd(data)).toBe("/");
		});

		it("should handle paths with special characters", () => {
			const data = `${ESC}]7;file://host/path/with-dashes_and.dots${BEL}`;
			expect(parseCwd(data)).toBe("/path/with-dashes_and.dots");
		});

		it("should not match partial or malformed sequences", () => {
			// Missing file:// prefix
			expect(parseCwd(`${ESC}]7;/Users/test${BEL}`)).toBeNull();
			// Missing path
			expect(parseCwd(`${ESC}]7;file://host${BEL}`)).toBeNull();
		});

		it("should handle sequences embedded in terminal output", () => {
			const data = `command output here ${ESC}]7;file://host/new/dir${BEL} more output`;
			expect(parseCwd(data)).toBe("/new/dir");
		});
	});
});
