import { describe, expect, test } from "bun:test";
import { initI18n } from "@superset/i18n";
import { getRepositoryMismatchLabel } from "./getRepositoryMismatchLabel";

initI18n();

describe("getRepositoryMismatchLabel", () => {
	test("hides mismatches when another repository returned a result", () => {
		expect(
			getRepositoryMismatchLabel(
				[{ repoMismatch: "acme/one" }, { repoMismatch: undefined }],
				1,
			),
		).toBeNull();
	});

	test("names a single mismatched repository", () => {
		expect(getRepositoryMismatchLabel([{ repoMismatch: "acme/one" }], 0)).toBe(
			"acme/one",
		);
	});

	test("uses a generic label when every selected repository mismatches", () => {
		expect(
			getRepositoryMismatchLabel(
				[{ repoMismatch: "acme/one" }, { repoMismatch: "acme/two" }],
				0,
			),
		).toBe("one of the selected repositories");
	});

	test("waits when any repository has not reported a mismatch", () => {
		expect(
			getRepositoryMismatchLabel([{ repoMismatch: "acme/one" }, undefined], 0),
		).toBeNull();
		expect(
			getRepositoryMismatchLabel([{ repoMismatch: "acme/one" }, {}], 0),
		).toBeNull();
	});
});
