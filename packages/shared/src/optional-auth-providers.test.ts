import { expect, test } from "bun:test";
import * as providers from "./optional-auth-providers";

const { optionalAuthProviders } = providers;

test("optional sign-in buttons stay absent by default", () => {
	expect(optionalAuthProviders()).toEqual([]);
});
test("native mobile capabilities and visible actions use one explicit provider selection", () => {
	expect(providers.mobileAuthProviders()).toEqual([
		"apple",
		"github",
		"google",
	]);
	expect(providers.mobileAuthProviders("authentik")).toEqual(["authentik"]);
	for (const empty of ["", "  "])
		expect(providers.mobileAuthProviders(empty)).toEqual([
			"apple",
			"github",
			"google",
		]);
	expect(providers.mobileAuthProviders("unknown")).toEqual([]);
	expect(
		providers.mobileAuthProviders("google,authentik,google,unknown"),
	).toEqual(["google", "authentik"]);
});
test("operator flags expose only registered extension names", () => {
	expect(
		optionalAuthProviders("github,gitlab,authentik,invalid,gitlab"),
	).toEqual(["authentik"]);
});
