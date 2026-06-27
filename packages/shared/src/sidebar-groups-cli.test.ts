import { afterEach, describe, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	rmSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
	acknowledgeSidebarGroupsCliOperation,
	enqueueSidebarGroupsCliOperation,
	getSidebarGroupsCliStatePath,
	mutateSidebarGroupsCliState,
	readNextSidebarGroupsCliOperation,
	readSidebarGroupsCliState,
	writeSidebarGroupsCliSnapshot,
} from "./sidebar-groups-cli";

let tempHome = mkdtempSync(join(tmpdir(), "sidebar-groups-cli-"));

afterEach(() => {
	rmSync(tempHome, { recursive: true, force: true });
	tempHome = mkdtempSync(join(tmpdir(), "sidebar-groups-cli-"));
});

describe("sidebar groups CLI bridge state", () => {
	test("stores snapshots and queues operations per organization", () => {
		writeSidebarGroupsCliSnapshot(
			{ homeDir: tempHome, organizationId: "org-1" },
			{
				updatedAt: "2026-01-01T00:00:00.000Z",
				sections: [
					{
						id: "section-1",
						projectId: "project-1",
						name: "Backend",
						createdAt: "2026-01-01T00:00:00.000Z",
						tabOrder: 1,
						isCollapsed: false,
						color: null,
					},
				],
				workspaces: [
					{
						id: "workspace-1",
						projectId: "project-1",
						name: "Fix auth",
						branch: "fix-auth",
						sectionId: "section-1",
						tabOrder: 1,
					},
				],
			},
		);
		enqueueSidebarGroupsCliOperation(
			{ homeDir: tempHome, organizationId: "org-1" },
			{
				id: "operation-1",
				type: "renameSection",
				createdAt: "2026-01-01T00:00:01.000Z",
				sectionId: "section-1",
				name: "API",
			},
		);

		const state = readSidebarGroupsCliState({
			homeDir: tempHome,
			organizationId: "org-1",
		});
		expect(state.snapshot?.sections[0]?.name).toBe("Backend");
		expect(state.operations).toHaveLength(1);
		expect(
			readSidebarGroupsCliState({
				homeDir: tempHome,
				organizationId: "org-2",
			}).snapshot,
		).toBeNull();
	});

	test("claims and acknowledges queued operations one at a time", () => {
		enqueueSidebarGroupsCliOperation(
			{ homeDir: tempHome, organizationId: "org-1" },
			{
				id: "operation-1",
				type: "deleteSection",
				createdAt: "2026-01-01T00:00:01.000Z",
				sectionId: "section-1",
			},
		);
		enqueueSidebarGroupsCliOperation(
			{ homeDir: tempHome, organizationId: "org-1" },
			{
				id: "operation-2",
				type: "renameSection",
				createdAt: "2026-01-01T00:00:02.000Z",
				sectionId: "section-1",
				name: "API",
			},
		);

		const firstOperation = readNextSidebarGroupsCliOperation({
			homeDir: tempHome,
			organizationId: "org-1",
		});
		expect(firstOperation?.id).toBe("operation-1");
		expect(
			readNextSidebarGroupsCliOperation({
				homeDir: tempHome,
				organizationId: "org-1",
			}),
		).toBeNull();
		expect(
			acknowledgeSidebarGroupsCliOperation(
				{ homeDir: tempHome, organizationId: "org-1" },
				"operation-2",
			),
		).toBe(false);
		expect(
			acknowledgeSidebarGroupsCliOperation(
				{ homeDir: tempHome, organizationId: "org-1" },
				"operation-1",
			),
		).toBe(true);
		expect(
			readNextSidebarGroupsCliOperation({
				homeDir: tempHome,
				organizationId: "org-1",
			})?.id,
		).toBe("operation-2");
	});

	test("requeues stale claimed operations", () => {
		enqueueSidebarGroupsCliOperation(
			{ homeDir: tempHome, organizationId: "org-1" },
			{
				id: "operation-1",
				type: "deleteSection",
				createdAt: "2026-01-01T00:00:01.000Z",
				sectionId: "section-1",
			},
		);
		enqueueSidebarGroupsCliOperation(
			{ homeDir: tempHome, organizationId: "org-1" },
			{
				id: "operation-2",
				type: "renameSection",
				createdAt: "2026-01-01T00:00:02.000Z",
				sectionId: "section-1",
				name: "API",
			},
		);
		expect(
			readNextSidebarGroupsCliOperation({
				homeDir: tempHome,
				organizationId: "org-1",
			})?.id,
		).toBe("operation-1");
		mutateSidebarGroupsCliState(
			{ homeDir: tempHome, organizationId: "org-1" },
			(state) => ({
				...state,
				claimedOperation: state.claimedOperation
					? {
							...state.claimedOperation,
							claimedAt: new Date(Date.now() - 120_000).toISOString(),
						}
					: null,
			}),
		);

		expect(
			readNextSidebarGroupsCliOperation({
				homeDir: tempHome,
				organizationId: "org-1",
			})?.id,
		).toBe("operation-1");
		expect(
			readSidebarGroupsCliState({
				homeDir: tempHome,
				organizationId: "org-1",
			}).operations.map((operation) => operation.id),
		).toEqual(["operation-2"]);
	});

	test("uses collision-free state paths for organization IDs", () => {
		expect(
			getSidebarGroupsCliStatePath({
				homeDir: tempHome,
				organizationId: "org/a",
			}),
		).not.toBe(
			getSidebarGroupsCliStatePath({
				homeDir: tempHome,
				organizationId: "org_a",
			}),
		);
	});

	test("recovers from stale lock directories", () => {
		const path = getSidebarGroupsCliStatePath({
			homeDir: tempHome,
			organizationId: "org-1",
		});
		const lockPath = `${path}.lock`;
		mkdirSync(lockPath, { recursive: true });
		const staleTime = new Date(Date.now() - 120_000);
		utimesSync(lockPath, staleTime, staleTime);

		enqueueSidebarGroupsCliOperation(
			{ homeDir: tempHome, organizationId: "org-1" },
			{
				id: "operation-1",
				type: "deleteSection",
				createdAt: "2026-01-01T00:00:01.000Z",
				sectionId: "section-1",
			},
		);

		expect(
			readSidebarGroupsCliState({
				homeDir: tempHome,
				organizationId: "org-1",
			}).operations.map((operation) => operation.id),
		).toEqual(["operation-1"]);
	});

	test("invalid JSON resets to an empty state", () => {
		const path = getSidebarGroupsCliStatePath({
			homeDir: tempHome,
			organizationId: "org-1",
		});
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, "{not-json");

		expect(
			readSidebarGroupsCliState({
				homeDir: tempHome,
				organizationId: "org-1",
			}),
		).toEqual({
			version: 1,
			organizationId: "org-1",
			snapshot: null,
			operations: [],
			claimedOperation: null,
		});
	});

	test("does not overwrite valid state when a mutation returns invalid data", () => {
		enqueueSidebarGroupsCliOperation(
			{ homeDir: tempHome, organizationId: "org-1" },
			{
				id: "operation-1",
				type: "deleteSection",
				createdAt: "2026-01-01T00:00:01.000Z",
				sectionId: "section-1",
			},
		);

		expect(() =>
			mutateSidebarGroupsCliState(
				{ homeDir: tempHome, organizationId: "org-1" },
				(state) => ({ ...state, organizationId: "org-2" }),
			),
		).toThrow("Invalid sidebar groups CLI state");

		expect(
			readSidebarGroupsCliState({
				homeDir: tempHome,
				organizationId: "org-1",
			}).operations.map((operation) => operation.id),
		).toEqual(["operation-1"]);
	});
});
