import { describe, expect, test } from "bun:test";
import {
	assertSafeDatabaseUrl,
	cleanupCandidatesForProject,
	parseFixtureArgs,
	repoNameFromUrl,
} from "./e2e-workspace-fixture";

describe("e2e workspace fixture helpers", () => {
	test("parses seed options", () => {
		expect(
			parseFixtureArgs([
				"seed",
				"--slug",
				"e2e-paseo",
				"--name",
				"Paseo",
				"--repo-url",
				"https://github.com/getpaseo/paseo.git",
			]),
		).toEqual({
			command: "seed",
			options: {
				slug: "e2e-paseo",
				name: "Paseo",
				"repo-url": "https://github.com/getpaseo/paseo.git",
			},
		});
	});

	test("refuses remote database urls by default", () => {
		expect(() =>
			assertSafeDatabaseUrl("postgres://user:pass@production.example.com/main"),
		).toThrow(/Refusing to touch non-local DATABASE_URL/);
		expect(() =>
			assertSafeDatabaseUrl("postgres://postgres:postgres@localhost:3195/main"),
		).not.toThrow();
	});

	test("derives cleanup directory candidates from repo urls", () => {
		expect(repoNameFromUrl("https://github.com/getpaseo/paseo.git")).toBe(
			"paseo",
		);
		expect(
			cleanupCandidatesForProject({
				id: "10000000-0000-4000-8000-000000001286",
				slug: "e2e-paseo-progress-1285",
				name: "Paseo",
				repoCloneUrl: "https://github.com/getpaseo/paseo.git",
			}),
		).toEqual([
			"10000000-0000-4000-8000-000000001286",
			"e2e-paseo-progress-1285",
			"Paseo",
			"paseo",
		]);
	});
});
