import { afterEach, expect, test } from "bun:test";
import {
	mobileM2Fixture,
	runMobileM2Child,
} from "../../../../../hooks/useOpenLink/testFixture.test";

if (process.env.TEST_MOBILE_M2 !== "1") {
	test(
		"actual mobile consumer in owned child",
		() => runMobileM2Child(import.meta.path),
		30000,
	);
} else {
	const f = await mobileM2Fixture();
	afterEach(f.cleanup);
	f.mockHistoryRows(new URL("./PullRequestsSheet.tsx", import.meta.url));
	f.mockLeaf(
		"../hooks/useWorkspaceRepo",
		{
			useWorkspaceRepo: () => {
				f.state.projectReads++;
				return {
					projectId: "project",
					repoUrl: "https://git.example:8443/Group/Sub/Repo.git",
				};
			},
		},
		new URL("./PullRequestsSheet.tsx", import.meta.url),
	);
	f.mockLeaf(
		"../utils/pullRequest",
		{
			PULL_REQUEST_STATUS: { open: { icon: () => null, ink: "open" } },
			pullRequestStatus: () => "open",
		},
		new URL("./PullRequestsSheet.tsx", import.meta.url),
	);
	f.mockLeaf("lucide-react-native", { ChevronRight: () => null });
	f.mockLeaf(
		"./components/RowDiffstat",
		{
			RowDiffstat: (props: Record<string, unknown>) => {
				f.state.diffstats.push(props);
				return null;
			},
		},
		new URL("./PullRequestsSheet.tsx", import.meta.url),
	);
	const { PullRequestsSheet } = await f.loadConsumer(
		new URL("./PullRequestsSheet.tsx", import.meta.url),
	);
	test("actual native history callback carries full identity and selected project", async () => {
		f.state.rows = [f.nativeRow];
		await f.render(PullRequestsSheet);
		f.state.presses[0]?.();
		expect(f.state.replaces.at(-1)).toEqual({
			pathname: "/workspace/[id]/pull-request/[pullRequestId]",
			params: {
				id: "workspace",
				pullRequestId: "17",
				owner: "Group/Sub",
				repo: "Repo",
				provider: "gitlab",
				expectedUrl: f.nativeUrl,
			},
		});
		expect(f.state.diffstats[0]).toMatchObject({
			projectId: "project",
			workspaceId: "workspace",
		});
	});
	test("actual GH history callback retains old keys", async () => {
		f.state.rows = [f.githubRow];
		await f.render(PullRequestsSheet);
		f.state.presses[0]?.();
		expect(f.state.replaces.at(-1)).toEqual({
			pathname: "/workspace/[id]/pull-request/[pullRequestId]",
			params: {
				id: "workspace",
				pullRequestId: "17",
				owner: "Owner",
				repo: "Repo",
			},
		});
	});
	test("history retains twenty-row diffstat cap", async () => {
		f.state.rows = Array.from({ length: 25 }, (_, i) => ({
			...f.nativeRow,
			key: String(i),
			prNumber: i + 1,
		}));
		await f.render(PullRequestsSheet);
		expect(f.state.diffstats.filter((row) => row.enabled)).toHaveLength(20);
	});
	test("contradictory native history callback refuses", async () => {
		f.state.rows = [{ ...f.nativeRow, repoName: "Other" }];
		await f.render(PullRequestsSheet);
		f.state.presses[0]?.();
		expect(f.state.replaces).toEqual([]);
	});
	test("GH history does not add a project metadata observer", async () => {
		f.state.rows = [f.githubRow];
		await f.render(PullRequestsSheet);
		expect(f.state.projectReads).toBe(0);
	});
}
