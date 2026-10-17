import { describe, expect, it } from "bun:test";
import { isSetupLikeCommand, parseCmux } from "./cmux";
import { readerFor } from "./test-utils";

describe("isSetupLikeCommand", () => {
	it("matches setup names and setup keywords that mention setup", () => {
		expect(isSetupLikeCommand({ name: "Project Setup", command: "make" })).toBe(
			true,
		);
		expect(
			isSetupLikeCommand({
				name: "Bootstrap",
				keywords: ["install"],
				command: "./setup.sh",
			}),
		).toBe(true);
		expect(
			isSetupLikeCommand({
				name: "Deps",
				keywords: ["install"],
				command: "bun install",
			}),
		).toBe(false);
		expect(isSetupLikeCommand({ name: "setup", workspace: {} })).toBe(false);
	});
});

describe("parseCmux", () => {
	it("prefers .cmux/cmux.json and imports the setup command and its cwd", () => {
		const parsed = parseCmux(
			readerFor({
				".cmux/cmux.json": JSON.stringify({
					commands: [
						{ name: "Dev layout", workspace: { layout: {} } },
						{
							name: "Setup",
							command: "bun install",
							cwd: "./web",
							confirm: true,
						},
					],
				}),
				"cmux.json": JSON.stringify({
					commands: [{ name: "setup", command: "make setup" }],
				}),
			}),
		);
		expect(parsed?.files).toEqual([".cmux/cmux.json"]);
		expect(parsed?.scripts.setup).toEqual(["bun install"]);
		expect(parsed?.cwd).toBe("web");
		expect(parsed?.notImported.map((entry) => entry.field)).toEqual([
			'commands["Setup"].confirm',
			'commands["Dev layout"]',
		]);
	});

	it("falls back to cmux.json and skips files without a setup-like command", () => {
		const parsed = parseCmux(
			readerFor({
				".cmux/cmux.json": JSON.stringify({
					commands: [{ name: "Lint", command: "bun lint" }],
				}),
				"cmux.json": JSON.stringify({
					commands: [{ name: "setup", command: "make setup" }],
				}),
			}),
		);
		expect(parsed?.files).toEqual(["cmux.json"]);
		expect(parseCmux(readerFor({ "cmux.json": '{"commands":[]}' }))).toBeNull();
	});
});
