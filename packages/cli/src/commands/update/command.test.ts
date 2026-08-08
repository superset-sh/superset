import { afterEach, describe, expect, test } from "bun:test";
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
