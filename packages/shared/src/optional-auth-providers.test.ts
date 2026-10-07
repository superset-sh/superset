import { expect, test } from "bun:test";
import {
	mobileAuthProviders,
	optionalAuthProviders,
} from "./optional-auth-providers";

test("optional sign-in buttons stay absent by default", () => {
	expect(optionalAuthProviders()).toEqual([]);
});
test("operator flags expose only registered extension names", () => {
	expect(
		optionalAuthProviders("github,gitlab,authentik,invalid,gitlab"),
	).toEqual(["gitlab"]);
});

for (const value of [undefined, "", "  "]) {
	test(`mobile hosted defaults for ${JSON.stringify(value)}`, () => {
		expect(mobileAuthProviders(value)).toEqual(["apple", "github", "google"]);
	});
}
test("mobile provider capabilities accept only registered providers", () => {
	expect(mobileAuthProviders("unknown,authentik")).toEqual([]);
	expect(mobileAuthProviders("gitlab")).toEqual(["gitlab"]);
	expect(
		mobileAuthProviders(" GOOGLE, gitlab, google, APPLE, github "),
	).toEqual(["apple", "github", "google", "gitlab"]);
});
