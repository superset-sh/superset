import { describe, expect, it } from "bun:test";
import { getHostServiceOrganizationIdsToStart } from "./getHostServiceOrganizationIdsToStart";

describe("getHostServiceOrganizationIdsToStart", () => {
	it("starts only the active organization when several organizations are known", () => {
		expect(
			getHostServiceOrganizationIdsToStart({
				activeOrganizationId: "org-active",
				knownOrganizationIds: ["org-inactive", "org-active"],
			}),
		).toEqual(["org-active"]);
	});

	it("starts the active organization even before the organizations collection is ready", () => {
		expect(
			getHostServiceOrganizationIdsToStart({
				activeOrganizationId: "org-active",
				knownOrganizationIds: [],
			}),
		).toEqual(["org-active"]);
	});

	it("does not start host-service when there is no active organization", () => {
		expect(
			getHostServiceOrganizationIdsToStart({
				activeOrganizationId: null,
				knownOrganizationIds: ["org-inactive"],
			}),
		).toEqual([]);
	});
});
