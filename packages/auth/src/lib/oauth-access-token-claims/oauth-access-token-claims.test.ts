import { describe, expect, test } from "bun:test";
import { oauthAccessTokenClaims } from "./oauth-access-token-claims";

const CONSENTED_ORG = "0f5b85fd-c324-421e-9f80-badc24eb1298";
const OTHER_ORG = "851c181e-7f0a-41cb-84fe-c5288bf6c3eb";

describe("oauthAccessTokenClaims (GHSA-qgxp-94x7-cf7q)", () => {
	test("carries only the organization the consent named", () => {
		const claims = oauthAccessTokenClaims({ referenceId: CONSENTED_ORG });

		expect(claims.organizationIds).toEqual([CONSENTED_ORG]);
		expect(claims.organizationId).toBe(CONSENTED_ORG);
	});

	test("never carries an organization the consent did not name", () => {
		const claims = oauthAccessTokenClaims({ referenceId: CONSENTED_ORG });

		expect(claims.organizationIds).not.toContain(OTHER_ORG);
	});

	test("reaches no organization when the consent named none", () => {
		expect(oauthAccessTokenClaims({}).organizationIds).toEqual([]);
	});

	test("passes a client name through for display, ignoring other metadata", () => {
		const claims = oauthAccessTokenClaims({
			referenceId: CONSENTED_ORG,
			// Registration is unauthenticated, so metadata is whatever the client
			// sent. Only client_name is read, and only as a label.
			metadata: { client_name: "Some App", organizationIds: [OTHER_ORG] },
		});

		expect(claims.client_name).toBe("Some App");
		expect(claims.organizationIds).toEqual([CONSENTED_ORG]);
	});
});
