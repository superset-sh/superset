import { describe, expect, test } from "bun:test";
import { emailDomains } from "./shareDirectory";

describe("emailDomains", () => {
	test("orders the organization's domains by how many members use them", () => {
		expect(
			emailDomains([
				"a@acme.dev",
				"b@acme.dev",
				"c@studio.design",
				"d@ACME.dev",
			]),
		).toEqual(["acme.dev", "studio.design", "gmail.com"]);
	});

	test("keeps a personal domain the members already use where it ranks", () => {
		expect(emailDomains(["a@gmail.com", "b@gmail.com", "c@acme.dev"])).toEqual([
			"gmail.com",
			"acme.dev",
		]);
	});

	test("still offers a personal domain with no members", () => {
		expect(emailDomains([])).toEqual(["gmail.com"]);
	});
});
