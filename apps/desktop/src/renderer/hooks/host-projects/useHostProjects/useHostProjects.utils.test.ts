import { describe, expect, it } from "bun:test";
import {
	type HostProjectRow,
	type HostProjectsQueryTarget,
	mergeHostProjects,
} from "./useHostProjects.utils";

const PROJECT_A = "3d4e5f6a-7b8c-4d9e-8f0a-1b2c3d4e5f6a";
const PROJECT_B = "5f6a7b8c-9d0e-4f1a-8b2c-3d4e5f6a7b8c";

const target: HostProjectsQueryTarget = {
	machineId: "machine-1",
	organizationId: "org-1",
	hostUrl: "http://127.0.0.1:1234",
	isLocal: true,
};

function projectRow(id: string, name: string): HostProjectRow {
	return {
		id,
		name,
		repoPath: `/tmp/${name}`,
		repoOwner: null,
		repoName: null,
		repoUrl: null,
		worktreeBaseDir: null,
		icon: null,
		color: null,
		createdAt: 0,
		updatedAt: 0,
	};
}

describe("mergeHostProjects", () => {
	it("drops a project whose id the sidebar collection cannot key, keeping the rest", () => {
		const merged = mergeHostProjects({
			hostResults: [
				{
					target,
					rows: [
						projectRow(PROJECT_A, "keeps-syncing"),
						projectRow("not-a-uuid", "quarantined"),
						projectRow(PROJECT_B, "also-syncs"),
					],
					reachable: true,
				},
			],
		});

		expect(merged.map((row) => row.name)).toEqual([
			"keeps-syncing",
			"also-syncs",
		]);
	});
});
