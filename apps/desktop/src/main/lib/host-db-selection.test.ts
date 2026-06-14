import { describe, expect, mock, test } from "bun:test";

mock.module("electron", () => ({
	app: {
		isPackaged: false,
		getAppPath: () => "/tmp/app",
		getVersion: () => "1.0.0",
	},
}));

mock.module("@superset/local-db", () => ({
	settings: {
		activeOrganizationId: "activeOrganizationId",
	},
}));

mock.module("main/lib/local-db", () => ({
	localDb: {
		select: () => ({
			from: () => ({
				get: () => ({ activeOrganizationId: null }),
			}),
		}),
	},
}));

mock.module("@superset/host-service/db", () => ({
	createDb: () => ({}),
}));

const { selectFallbackOrganizationId } = await import("./host-db");
type HostDbManifestCandidate = import("./host-db").HostDbManifestCandidate;

describe("selectFallbackOrganizationId", () => {
	test("prefers a live manifest over newer stopped manifests", () => {
		const candidates: HostDbManifestCandidate[] = [
			{
				organizationId: "org-stopped-new",
				startedAt: 30,
				isAlive: false,
			},
			{
				organizationId: "org-live",
				startedAt: 20,
				isAlive: true,
			},
		];

		expect(selectFallbackOrganizationId(candidates)).toBe("org-live");
	});

	test("falls back to the newest manifest when none are live", () => {
		const candidates: HostDbManifestCandidate[] = [
			{
				organizationId: "org-old",
				startedAt: 10,
				isAlive: false,
			},
			{
				organizationId: "org-new",
				startedAt: 20,
				isAlive: false,
			},
		];

		expect(selectFallbackOrganizationId(candidates)).toBe("org-new");
	});

	test("returns null when there are no candidates", () => {
		expect(selectFallbackOrganizationId([])).toBeNull();
	});
});
