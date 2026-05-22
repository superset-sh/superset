import { describe, expect, test } from "bun:test";
import cliConfig from "./cli.config";
import pkg from "./package.json";

describe("cli.config.ts", () => {
	test("version matches package.json so `superset --version` is correct", () => {
		expect(cliConfig.version).toBe(pkg.version);
	});

	test("SUPERSET_VERSION define matches package.json", () => {
		expect(cliConfig.define?.["process.env.SUPERSET_VERSION"]).toBe(
			JSON.stringify(pkg.version),
		);
	});
});
