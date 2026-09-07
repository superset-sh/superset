import { describe, expect, it, test } from "bun:test";
import {
	applyProjectChangedEvent,
	deriveHostProjectsQueryTargets,
	normalizeHostProjectRow,
} from "./useHostProjects.utils";

const tagSettings = [
	{
		tag: "api",
		displayName: "API",
		color: "#ff0000",
		tabOrder: null,
	},
];

describe("old-host tag settings compatibility", () => {
	test("normalization preserves project.list tag settings", () => {
		expect(
			normalizeHostProjectRow({
				id: "project",
				repoPath: "/tmp/project",
				tagSettings,
			}).tagSettings,
		).toEqual(tagSettings);
	});

	test("project events keep the last settings when a snapshot omits them", () => {
		const existing = normalizeHostProjectRow({
			id: "project",
			repoPath: "/tmp/project",
			tagSettings,
		});
		const next = applyProjectChangedEvent(
			[existing],
			{
				eventType: "updated",
				project: {
					id: "project",
					name: "Renamed",
					repoPath: "/tmp/project",
					repoOwner: null,
					repoName: null,
					repoUrl: null,
					worktreeBaseDir: null,
					icon: null,
					color: null,
					createdAt: 1,
					updatedAt: 2,
				},
			},
			"project",
		);
		expect(next?.[0]?.tagSettings).toEqual(tagSettings);
	});
});

describe("deriveHostProjectsQueryTargets", () => {
	it("keeps a null-URL local target while the host-service has no port, even with no host row", () => {
		// Same rule as deriveHostWorkspacesQueryTargets: the target keys the
		// cached rows and the snapshot, so it must outlive a restart or the
		// sidebar's project list clears for the length of the outage.
		const targets = deriveHostProjectsQueryTargets({
			activeHostUrl: null,
			hosts: [],
			machineId: "machine-1",
			relayUrl: "https://relay.test",
			fallbackOrganizationId: "org-1",
		});
		expect(targets).toEqual([
			{
				machineId: "machine-1",
				organizationId: "org-1",
				hostUrl: null,
				isLocal: true,
			},
		]);
	});
});
