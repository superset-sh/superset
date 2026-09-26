import { describe, expect, test } from "bun:test";
import { resolveInitialWindowOrganization } from "./resolveInitialWindowOrganization";

const fresh = <Value>(value: Value) => ({
	value,
	isFresh: true,
	hasFailed: false,
});
const stale = <Value>(value: Value) => ({
	value,
	isFresh: false,
	hasFailed: false,
});
const failed = <Value>(value: Value) => ({
	value,
	isFresh: false,
	hasFailed: true,
});

describe("resolveInitialWindowOrganization", () => {
	test("keeps the window's organization while the account belongs to it", () => {
		expect(
			resolveInitialWindowOrganization({
				windowOrganization: fresh("org-a"),
				memberOrganizationIds: fresh(["org-a", "org-a2"]),
				savedMemberOrganizationIds: null,
				isMemberListUnavailable: false,
				sessionOrganizationId: "org-a2",
			}),
		).toEqual({ status: "resolved", organizationId: "org-a" });
	});

	test("falls back to the session when the account left the window's organization", () => {
		expect(
			resolveInitialWindowOrganization({
				windowOrganization: fresh("org-gone"),
				memberOrganizationIds: fresh(["org-a"]),
				savedMemberOrganizationIds: null,
				isMemberListUnavailable: false,
				sessionOrganizationId: "org-a",
			}),
		).toEqual({ status: "resolved", organizationId: "org-a" });
	});

	test("a first window with nothing remembered seeds from the session at once", () => {
		expect(
			resolveInitialWindowOrganization({
				windowOrganization: fresh(null),
				memberOrganizationIds: stale(undefined),
				savedMemberOrganizationIds: null,
				isMemberListUnavailable: false,
				sessionOrganizationId: "org-a",
			}),
		).toEqual({ status: "resolved", organizationId: "org-a" });
	});

	test("does not trust the previous account's cached values after a sign-in", () => {
		// Signed in as account A. The cache still holds account B's organization
		// list and the window organization read during B's session.
		expect(
			resolveInitialWindowOrganization({
				windowOrganization: stale("org-b"),
				memberOrganizationIds: stale(["org-b"]),
				savedMemberOrganizationIds: null,
				isMemberListUnavailable: false,
				sessionOrganizationId: "org-a",
			}),
		).toEqual({ status: "waiting" });
	});

	test("does not check a fresh window organization against a cached member list", () => {
		expect(
			resolveInitialWindowOrganization({
				windowOrganization: fresh("org-b"),
				memberOrganizationIds: stale(["org-b"]),
				savedMemberOrganizationIds: null,
				isMemberListUnavailable: false,
				sessionOrganizationId: "org-a",
			}),
		).toEqual({ status: "waiting" });
	});

	test("resolves to the session once both reads are fresh for the new account", () => {
		expect(
			resolveInitialWindowOrganization({
				windowOrganization: fresh("org-b"),
				memberOrganizationIds: fresh(["org-a"]),
				savedMemberOrganizationIds: null,
				isMemberListUnavailable: false,
				sessionOrganizationId: "org-a",
			}),
		).toEqual({ status: "resolved", organizationId: "org-a" });
	});

	test("waits when there is no session organization to fall back to", () => {
		expect(
			resolveInitialWindowOrganization({
				windowOrganization: fresh(null),
				memberOrganizationIds: fresh([]),
				savedMemberOrganizationIds: null,
				isMemberListUnavailable: false,
				sessionOrganizationId: null,
			}),
		).toEqual({ status: "waiting" });
	});

	test("fails when the window organization read gave up", () => {
		expect(
			resolveInitialWindowOrganization({
				windowOrganization: failed(undefined),
				memberOrganizationIds: fresh(["org-a"]),
				savedMemberOrganizationIds: null,
				isMemberListUnavailable: false,
				sessionOrganizationId: "org-a",
			}),
		).toEqual({ status: "failed" });
	});

	test("fails when the member list gave up and the window organization needs it", () => {
		expect(
			resolveInitialWindowOrganization({
				windowOrganization: fresh("org-a"),
				memberOrganizationIds: failed(["org-a"]),
				savedMemberOrganizationIds: null,
				isMemberListUnavailable: false,
				sessionOrganizationId: "org-a",
			}),
		).toEqual({ status: "failed" });
	});

	test("a failed member list does not matter to a window with nothing remembered", () => {
		expect(
			resolveInitialWindowOrganization({
				windowOrganization: fresh(null),
				memberOrganizationIds: failed(undefined),
				savedMemberOrganizationIds: null,
				isMemberListUnavailable: false,
				sessionOrganizationId: "org-a",
			}),
		).toEqual({ status: "resolved", organizationId: "org-a" });
	});

	describe("when the server cannot provide the member list", () => {
		test("keeps the window organization the saved membership confirms", () => {
			expect(
				resolveInitialWindowOrganization({
					windowOrganization: fresh("org-a2"),
					memberOrganizationIds: failed(undefined),
					savedMemberOrganizationIds: ["org-a", "org-a2"],
					isMemberListUnavailable: true,
					sessionOrganizationId: "org-a",
				}),
			).toEqual({ status: "resolved", organizationId: "org-a2" });
		});

		test("does not wait for the retries to run out", () => {
			expect(
				resolveInitialWindowOrganization({
					windowOrganization: fresh("org-a"),
					memberOrganizationIds: stale(undefined),
					savedMemberOrganizationIds: ["org-a"],
					isMemberListUnavailable: true,
					sessionOrganizationId: "org-a",
				}),
			).toEqual({ status: "resolved", organizationId: "org-a" });
		});

		test("falls back to the session organization when the saved membership confirms only that", () => {
			expect(
				resolveInitialWindowOrganization({
					windowOrganization: fresh("org-gone"),
					memberOrganizationIds: failed(undefined),
					savedMemberOrganizationIds: ["org-a"],
					isMemberListUnavailable: true,
					sessionOrganizationId: "org-a",
				}),
			).toEqual({ status: "resolved", organizationId: "org-a" });
		});

		test("never adopts an organization the saved membership does not list", () => {
			// The previous account's window organization, this account's saved
			// membership: the incident's shape, with the server down.
			expect(
				resolveInitialWindowOrganization({
					windowOrganization: fresh("org-b"),
					memberOrganizationIds: failed(["org-b"]),
					savedMemberOrganizationIds: ["org-a"],
					isMemberListUnavailable: true,
					sessionOrganizationId: null,
				}),
			).toEqual({ status: "failed" });
		});

		test("a fresh sign-in with nothing saved yet uses the session organization, never the window's", () => {
			// The incident's shape with the server down: the window still remembers
			// the previous account's organization.
			expect(
				resolveInitialWindowOrganization({
					windowOrganization: fresh("org-b"),
					memberOrganizationIds: failed(["org-b"]),
					savedMemberOrganizationIds: null,
					isMemberListUnavailable: true,
					sessionOrganizationId: "org-a",
				}),
			).toEqual({ status: "resolved", organizationId: "org-a" });
		});

		test("fails only when there is no session organization either", () => {
			expect(
				resolveInitialWindowOrganization({
					windowOrganization: fresh("org-a"),
					memberOrganizationIds: failed(undefined),
					savedMemberOrganizationIds: null,
					isMemberListUnavailable: true,
					sessionOrganizationId: null,
				}),
			).toEqual({ status: "failed" });
		});

		test("still waits for the server while it is merely slow to start", () => {
			expect(
				resolveInitialWindowOrganization({
					windowOrganization: fresh("org-a"),
					memberOrganizationIds: stale(undefined),
					savedMemberOrganizationIds: ["org-a"],
					isMemberListUnavailable: false,
					sessionOrganizationId: "org-a",
				}),
			).toEqual({ status: "waiting" });
		});
	});
});
