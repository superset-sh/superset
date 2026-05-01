import { describe, expect, it } from "bun:test";
import { parseFreshExecArgv } from "./fresh-exec";

describe("parseFreshExecArgv", () => {
	it("parses invocation via shell function (argv[0] is fresh-exec)", () => {
		const result = parseFreshExecArgv(["fresh-exec", "gh", "auth", "login"]);
		expect(result).toEqual({ command: "gh", args: ["auth", "login"] });
	});

	it("parses invocation via node directly", () => {
		const result = parseFreshExecArgv([
			"/usr/bin/node",
			"/path/to/fresh-exec.js",
			"terraform",
			"apply",
		]);
		expect(result).toEqual({ command: "terraform", args: ["apply"] });
	});

	it("handles command with no args", () => {
		const result = parseFreshExecArgv(["fresh-exec", "gh"]);
		expect(result).toEqual({ command: "gh", args: [] });
	});

	it("throws on missing command (only fresh-exec itself)", () => {
		expect(() => parseFreshExecArgv(["fresh-exec"])).toThrow();
	});

	it("throws on empty argv", () => {
		expect(() => parseFreshExecArgv([])).toThrow();
	});

	it("handles a full node-invoked path with ts extension", () => {
		const result = parseFreshExecArgv([
			"/usr/local/bin/node",
			"/opt/app/dist/fresh-exec.js",
			"ssh",
			"-p",
			"22",
			"host.example",
		]);
		expect(result).toEqual({
			command: "ssh",
			args: ["-p", "22", "host.example"],
		});
	});
});
