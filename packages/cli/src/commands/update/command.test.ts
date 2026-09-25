import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import cliConfig from "../../../cli.config";
import updateCommand from "./command";

function invoke() {
	return updateCommand.run({
		ctx: {} as never,
		args: {} as never,
		options: {} as never,
		signal: new AbortController().signal,
	});
}

afterEach(() => {
	delete process.env.SUPERSET_CLI_CHANNEL;
});

describe("update", () => {
	test("refuses to run from the desktop-bundled CLI", async () => {
		process.env.SUPERSET_CLI_CHANNEL = "desktop-bundled";
		await expect(invoke()).rejects.toThrow(
			/bundled with the Superset desktop app/,
		);
	});

	test("standalone dev builds hit the dev-build guard instead", async () => {
		await expect(invoke()).rejects.toThrow(/only available in built binaries/);
	});
});

// Release binaries get SUPERSET_CLI_CHANNEL via build-time define replacement,
// not runtime env — assert that wiring statically so a regression can't slip
// past the runtime-env tests above.
describe("channel build wiring", () => {
	test("cli.config.ts bakes SUPERSET_CLI_CHANNEL, defaulting to standalone", () => {
		expect(cliConfig.define?.["process.env.SUPERSET_CLI_CHANNEL"]).toBe(
			JSON.stringify("standalone"),
		);
	});

	test("desktop bundled-CLI build sets the desktop-bundled channel", () => {
		// Importing the script would run it (and trips the CLI tsconfig rootDir),
		// so assert against its source instead.
		const buildScript = readFileSync(
			new URL(
				"../../../../../apps/desktop/scripts/build-bundled-cli.ts",
				import.meta.url,
			),
			"utf8",
		);
		expect(buildScript).toMatch(
			/SUPERSET_CLI_CHANNEL\s*[:=]\s*"desktop-bundled"/,
		);
	});
});
