import { describe, expect, test } from "bun:test";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { checkpointDirectoryForDatabase } from "./history";

describe("private saved conversation checkpoint location", () => {
	test.each([
		"relative-state/host.db",
		"/private/tmp/synthetic-state/host.db",
	])("resolves the accepted database path %s", (dbPath) => {
		const directory = checkpointDirectoryForDatabase(dbPath);
		expect(isAbsolute(directory)).toBe(true);
		expect(directory).toBe(
			join(dirname(resolve(dbPath)), "saved-conversation-checkpoints"),
		);
	});
	test("does not choose a checkpoint location without a configured database", () => {
		expect(checkpointDirectoryForDatabase(undefined)).toBe("");
	});
});
