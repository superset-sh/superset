import { describe, expect, test } from "bun:test";
import { onePerName } from "./onePerName";

const row = (marketplace: string, installed: boolean) => ({
	name: "notion",
	marketplace,
	installed,
});

describe("onePerName", () => {
	test("an installed plugin replaces the available one with the same name", () => {
		const installed = row("acme", true);
		expect(onePerName([row("superset", false), installed])).toEqual([
			installed,
		]);
	});

	test("between two installs of one name, the first-party install stays", () => {
		const firstParty = row("superset", true);
		expect(onePerName([row("acme", true), firstParty])).toEqual([firstParty]);
	});
});
