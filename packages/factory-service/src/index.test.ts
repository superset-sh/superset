import { describe, expect, test } from "bun:test";
import { resolveSupersetFactoryPaths } from "./index";

describe("resolveSupersetFactoryPaths", () => {
	test("keeps Factory state isolated beside the host database", () => {
		expect(
			resolveSupersetFactoryPaths(
				"/Users/example/Library/Application Support/Superset/org/host.db",
			),
		).toEqual({
			databaseUrl:
				"file:/Users/example/Library/Application Support/Superset/org/factory.db",
			sandboxRoot:
				"/Users/example/Library/Application Support/Superset/org/factory-sandboxes",
		});
	});
});
