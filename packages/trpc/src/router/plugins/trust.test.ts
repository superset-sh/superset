import { describe, expect, test } from "bun:test";
import { trustedManifest } from "./manifest";

// The identity probe posts the user's credential to a URL the manifest names.
// Only a manifest we ship may do that; anything else would be a way to harvest
// a token the moment a user connects.
describe("trustedManifest", () => {
	test("trusts the first-party marketplace", () => {
		expect(trustedManifest("superset")).toBe(true);
	});

	test.each([
		["devlocal"],
		["community"],
		["Superset"],
		["superset-plugins"],
		[""],
	])("does not trust %j", (marketplace) => {
		expect(trustedManifest(marketplace)).toBe(false);
	});
});
