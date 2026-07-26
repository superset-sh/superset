import { afterEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listManifests } from "./manifest";

let testRoot: string | null = null;

afterEach(() => {
	if (testRoot) rmSync(testRoot, { recursive: true, force: true });
	testRoot = null;
});

describe("listManifests", () => {
	it("discovers valid organization host manifests and ignores malformed rows", () => {
		testRoot = mkdtempSync(join(tmpdir(), "superset-cli-manifests-"));
		const validDir = join(testRoot, "host", "org-valid");
		const invalidDir = join(testRoot, "host", "org-invalid");
		mkdirSync(validDir, { recursive: true });
		mkdirSync(invalidDir, { recursive: true });
		writeFileSync(
			join(validDir, "manifest.json"),
			JSON.stringify({
				pid: 123,
				endpoint: "http://127.0.0.1:1234",
				authToken: "token",
				startedAt: 1,
				organizationId: "org-valid",
			}),
		);
		writeFileSync(join(invalidDir, "manifest.json"), "not json");

		expect(listManifests(testRoot)).toEqual([
			{
				pid: 123,
				endpoint: "http://127.0.0.1:1234",
				authToken: "token",
				startedAt: 1,
				organizationId: "org-valid",
			},
		]);
	});
});
