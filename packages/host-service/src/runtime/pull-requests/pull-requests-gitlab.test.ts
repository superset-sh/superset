import { describe, expect, mock, test } from "bun:test";
import { PullRequestRuntimeManager } from "./pull-requests";

describe("GitLab pull request runtime", () => {
	test("keeps source-project path cache separate for equal IDs on different instances", async () => {
		const api = mock(async (identity: { instance: string }) => ({
			path_with_namespace: `${new URL(identity.instance).hostname}/group/fork`,
		}));
		const manager = new PullRequestRuntimeManager({
			db: {} as never,
			git: (async () => ({})) as never,
			github: (async () => ({})) as never,
			gitlab: { api } as never,
			gitWatcher: { onChanged: () => () => {} } as never,
		} as never);
		const getPath = (
			manager as unknown as {
				getGitLabSourceProjectPath: (
					repo: {
						instance: string;
						owner: string;
						name: string;
						projectNumericId: number;
					},
					projectId: number,
				) => Promise<string | null>;
			}
		).getGitLabSourceProjectPath.bind(manager);
		const first = {
			instance: "https://first.example.com",
			owner: "group",
			name: "project",
			projectNumericId: 1,
		};
		const second = { ...first, instance: "https://second.example.com" };
		expect(await getPath(first, 42)).toBe("first.example.com/group/fork");
		expect(await getPath(second, 42)).toBe("second.example.com/group/fork");
		expect(await getPath(first, 42)).toBe("first.example.com/group/fork");
		expect(api).toHaveBeenCalledTimes(2);
		expect(api).toHaveBeenCalledWith(
			{ instance: second.instance },
			"projects/42",
		);
	});
});
