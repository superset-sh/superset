import { describe, expect, it } from "bun:test";
import { matchSources } from "./matchSources";

const source = (browserName: string, profileName = "Default") => ({
	browserName,
	profileName,
});

const SOURCES = [
	source("Google Chrome"),
	source("Chrome Beta"),
	source("Chrome Beta", "Beta Only"),
	source("Microsoft Edge"),
	source("Microsoft Edge Dev"),
	source("Opera"),
	source("Opera GX"),
	source("Aside", "Work"),
	source("Aside", "Personal"),
];

const names = (from: string, profile?: string) =>
	matchSources(SOURCES, from, profile).map(
		(s) => `${s.browserName}/${s.profileName}`,
	);

describe("matchSources", () => {
	it("prefers the base browser over its other channels", () => {
		expect(names("Chrome")).toEqual(["Google Chrome/Default"]);
		expect(names("edge")).toEqual(["Microsoft Edge/Default"]);
		expect(names("Opera")).toEqual(["Opera/Default"]);
	});

	it("selects a channel by its full name", () => {
		expect(names("Opera GX")).toEqual(["Opera GX/Default"]);
		expect(names("chrome beta", "default")).toEqual(["Chrome Beta/Default"]);
	});

	it("falls back to a partial match", () => {
		expect(names("Edge D")).toEqual(["Microsoft Edge Dev/Default"]);
	});

	it("narrows by profile", () => {
		expect(names("Aside")).toHaveLength(2);
		expect(names("Aside", "work")).toEqual(["Aside/Work"]);
	});

	it("never switches browser to find a profile", () => {
		expect(names("Chrome", "Beta Only")).toEqual([]);
	});
});
