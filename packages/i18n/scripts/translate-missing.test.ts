import { describe, expect, test } from "bun:test";
import { integrityError, stripIcu } from "./translate-missing";

describe("stripIcu", () => {
	test("removes ICU blocks, keeps simple placeholders", () => {
		expect(stripIcu("Hello {name}")).toBe("Hello {name}");
		expect(stripIcu("{n, plural, one {# item} other {# items}} left")).toBe(
			" left",
		);
		expect(
			stripIcu("{n, plural, one {a {nested} b} other {c}} and {keep}"),
		).toBe(" and {keep}");
	});
});

describe("integrityError", () => {
	test("accepts a faithful translation", () => {
		expect(integrityError("Open {name}", "Ouvrir {name}", "fr")).toBeNull();
	});

	test("rejects a dropped placeholder", () => {
		expect(integrityError("Open {name}", "Ouvrir", "fr")).toContain("{name}");
	});

	test("rejects a translated placeholder identifier", () => {
		expect(integrityError("Open {name}", "Ouvrir {nom}", "fr")).toContain(
			"{name}",
		);
	});

	test("rejects unbalanced tag markers", () => {
		expect(
			integrityError("<0>Learn more</0>", "En savoir plus</0>", "fr"),
		).toBe("tag markers changed");
		expect(
			integrityError("<0>Learn more<1/></0>", "<0>En savoir plus</0>", "fr"),
		).toBe("tag markers changed");
	});

	test("rejects a removed ICU block", () => {
		expect(
			integrityError(
				"{n, plural, one {# file} other {# files}}",
				"des fichiers",
				"fr",
			),
		).toBe("ICU structure changed");
	});

	test("ICU branch prose may be reworded without placeholder complaints", () => {
		expect(
			integrityError(
				"{n, plural, one {one {thing}} other {many}}",
				"{n, plural, one {une chose} other {plusieurs}}",
				"fr",
			),
		).toBeNull();
	});

	test("requires few/many for Slavic plurals", () => {
		const source = "{n, plural, one {# file} other {# files}}";
		expect(
			integrityError(source, "{n, plural, one {# plik} other {# pliki}}", "pl"),
		).toBe("Slavic plural missing few/many branches");
		expect(
			integrityError(
				source,
				"{n, plural, one {# plik} few {# pliki} many {# plików} other {# pliku}}",
				"pl",
			),
		).toBeNull();
		// Non-Slavic locales are not held to the four-branch rule.
		expect(
			integrityError(source, "{n, plural, one {# file} other {# files}}", "fr"),
		).toBeNull();
	});
});
