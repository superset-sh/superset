import { describe, expect, it } from "bun:test";
import { resolveWindowOrg } from "./resolveWindowOrg";

const base = {
	windowOrgPending: false,
	windowOrgId: "org-registry",
	organizations: undefined,
	organizationsErrored: false,
	sessionOrgId: "org-session",
};

describe("resolveWindowOrg", () => {
	it("waits while the registry read is pending", () => {
		expect(
			resolveWindowOrg({
				...base,
				windowOrgPending: true,
				organizationsErrored: true,
			}),
		).toEqual({ kind: "wait" });
	});

	it("waits while the registry org exists and the list is loading", () => {
		expect(resolveWindowOrg(base)).toEqual({ kind: "wait" });
	});

	it("is unresolvable when the registry org exists and the list failed", () => {
		expect(resolveWindowOrg({ ...base, organizationsErrored: true })).toEqual({
			kind: "unresolvable",
		});
	});

	it("keeps the registry org when it is still a membership", () => {
		expect(
			resolveWindowOrg({
				...base,
				organizations: [{ id: "org-other" }, { id: "org-registry" }],
			}),
		).toEqual({ kind: "resolved", organizationId: "org-registry" });
	});

	it("falls back to the session org when the registry org is dead", () => {
		expect(
			resolveWindowOrg({ ...base, organizations: [{ id: "org-other" }] }),
		).toEqual({ kind: "resolved", organizationId: "org-session" });
	});

	it("resolves to the session org with no registry org even if the list failed", () => {
		expect(
			resolveWindowOrg({
				...base,
				windowOrgId: null,
				organizationsErrored: true,
			}),
		).toEqual({ kind: "resolved", organizationId: "org-session" });
	});

	it("waits when nothing can supply an org", () => {
		expect(
			resolveWindowOrg({ ...base, windowOrgId: null, sessionOrgId: undefined }),
		).toEqual({ kind: "wait" });
	});
});
