import { describe, expect, test } from "bun:test";
import { oauthAccessTokenClaims } from "@superset/auth/oauth-access-token-claims";
import { isFirstPartyOAuthClient } from "@superset/shared/auth";
import { assertMember } from "./lib/cloud-guards";
import { resolveActiveOrganizationId } from "./trpc";

const CONSENTED_ORG = "0f5b85fd-c324-421e-9f80-badc24eb1298";
const OTHER_ORG = "851c181e-7f0a-41cb-84fe-c5288bf6c3eb";
const THIRD_ORG = "a834634c-2ba2-4072-ae8e-46ac16b30768";

/**
 * A user in three organizations consents once, for one of them. What
 * `jwtProcedure` then authorizes is whatever the access token claims, so the
 * claim and the authorizer are tested together (GHSA-qgxp-94x7-cf7q).
 */
const consentedClaims = oauthAccessTokenClaims({ referenceId: CONSENTED_ORG });

describe("an OAuth access token's reach (GHSA-qgxp-94x7-cf7q)", () => {
	test("names only the consented organization, not the user's other memberships", () => {
		expect(consentedClaims.organizationIds).toEqual([CONSENTED_ORG]);
		expect(consentedClaims.organizationIds).not.toContain(OTHER_ORG);
		expect(consentedClaims.organizationIds).not.toContain(THIRD_ORG);
	});

	test("the org header cannot move it to an organization it never consented to", () => {
		expect(() =>
			resolveActiveOrganizationId(consentedClaims.organizationIds, OTHER_ORG),
		).toThrow(`Not a member of organization ${OTHER_ORG}`);
	});

	test("the org header still works for the consented organization", () => {
		expect(
			resolveActiveOrganizationId(
				consentedClaims.organizationIds,
				CONSENTED_ORG,
			),
		).toBe(CONSENTED_ORG);
	});

	test("procedures that take an organization id reject the other ones", () => {
		expect(() =>
			assertMember(consentedClaims.organizationIds, OTHER_ORG),
		).toThrow();
		expect(() =>
			assertMember(consentedClaims.organizationIds, CONSENTED_ORG),
		).not.toThrow();
	});

	test("with no organization consented, it reaches none", () => {
		const claims = oauthAccessTokenClaims({});

		expect(
			resolveActiveOrganizationId(claims.organizationIds, null),
		).toBeNull();
		expect(() =>
			resolveActiveOrganizationId(claims.organizationIds, CONSENTED_ORG),
		).toThrow();
	});
});

describe("isFirstPartyOAuthClient", () => {
	test("recognises the shipped CLI, whose organizations jwtProcedure reads from the membership table", () => {
		expect(isFirstPartyOAuthClient("superset-cli")).toBe(true);
	});

	test("rejects a registered client, and anything that is not a client id", () => {
		expect(isFirstPartyOAuthClient("vzwdeKlcGeQZyyfYSqDVjLujlhedhMTG")).toBe(
			false,
		);
		expect(isFirstPartyOAuthClient(undefined)).toBe(false);
		expect(isFirstPartyOAuthClient(["superset-cli"])).toBe(false);
	});
});
