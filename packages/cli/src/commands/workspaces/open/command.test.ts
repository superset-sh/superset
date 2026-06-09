import { describe, expect, test } from "bun:test";
import { buildOpenUrlSpawn } from "./command";

describe("buildOpenUrlSpawn", () => {
	test("uses cmd.exe with verbatim arguments on Windows", () => {
		const url = "superset://v2-workspace/wsp_abc?name=a%20b&from=cli%25test";
		const result = buildOpenUrlSpawn(url, "win32", {
			COMSPEC: "C:\\Windows\\System32\\cmd.exe",
		});

		expect(result).toEqual({
			command: "C:\\Windows\\System32\\cmd.exe",
			args: ["/d", "/s", "/c", `start "" "${url}"`],
			windowsVerbatimArguments: true,
		});
	});

	test("uses direct argument arrays on macOS and Linux", () => {
		expect(
			buildOpenUrlSpawn("superset://v2-workspace/wsp_abc", "darwin"),
		).toEqual({
			command: "open",
			args: ["superset://v2-workspace/wsp_abc"],
		});
		expect(
			buildOpenUrlSpawn("superset://v2-workspace/wsp_abc", "linux"),
		).toEqual({
			command: "xdg-open",
			args: ["superset://v2-workspace/wsp_abc"],
		});
	});
});
