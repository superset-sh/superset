import { afterEach, expect, test } from "bun:test";
import {
	mobileM2Fixture,
	runMobileM2Child,
} from "../../../../../../hooks/useOpenLink/testFixture.test";

if (process.env.TEST_MOBILE_M2 !== "1") {
	test(
		"route and retry share complete validated identity in an owned child",
		() => runMobileM2Child(import.meta.path),
		30000,
	);
} else {
	const f = await mobileM2Fixture();
	let params: Record<string, string> = {
		id: "workspace",
		pullRequestId: "17",
		provider: "gitlab",
		owner: "Group/Sub",
		repo: "Repo",
		expectedUrl: f.nativeUrl,
	};
	let metadata = {
		projectId: "project",
		repoUrl: "https://git.example:8443/Group/Sub/Repo.git",
		owner: "Group/Sub",
		repo: "Repo",
		isReady: true,
	};
	let detailInput: Record<string, unknown> = {};
	let retryCount = 0;
	f.mockLeaf("expo-router", { useLocalSearchParams: () => params });
	f.mockLeaf(
		"@/screens/(authenticated)/workspace/[id]/hooks/useWorkspaceRepo",
		{ useWorkspaceRepo: () => metadata },
	);
	f.mockLeaf(
		"@/screens/(authenticated)/workspace/[id]/hooks/useWorkspacePullRequestDetail",
		{
			useWorkspacePullRequestDetail: (input: Record<string, unknown>) => {
				detailInput = input;
				return {};
			},
		},
	);
	const { usePullRequestRoute } = await import("./usePullRequestRoute");
	const { useGitlabDetailRetry } = await import(
		"./hooks/useGitlabDetailRetry/useGitlabDetailRetry"
	);
	let value: ReturnType<typeof usePullRequestRoute>;
	let retry: ReturnType<typeof useGitlabDetailRetry>;
	function Probe() {
		value = usePullRequestRoute();
		retry = useGitlabDetailRetry({
			workspaceId: value.workspaceId,
			owner: value.owner,
			repo: value.repo,
			pullNumber: value.pullNumber,
			refetch: async () => {
				retryCount++;
			},
		});
		return null;
	}
	afterEach(async () => {
		await f.cleanup();
	});
	test("positive safe route number drives both detail and retry", async () => {
		for (const input of ["17junk", "0", "-1", "9007199254740992", "17"]) {
			params = { ...params, pullRequestId: input };
			await f.render(Probe);
			expect(value.pullNumber).toBe(input === "17" ? 17 : null);
			expect(detailInput.pullNumber).toBe(input === "17" ? 17 : null);
			expect(retry.canRetry).toBe(input === "17");
		}
	});
	test("explicit Github coordinates from a native workspace retain the Github path", async () => {
		params = {
			id: "workspace",
			pullRequestId: "17",
			provider: "github",
			owner: "Other",
			repo: "Github",
		};
		await f.render(Probe);
		expect(detailInput).toEqual({
			workspaceId: "workspace",
			owner: "Other",
			repo: "Github",
			pullNumber: 17,
		});
		expect(retry.canRetry).toBe(false);
	});
	test("retry requires current repo readiness and exact same native identity", async () => {
		params = {
			id: "workspace",
			pullRequestId: "17",
			provider: "gitlab",
			owner: "Group/Sub",
			repo: "Repo",
			expectedUrl: f.nativeUrl,
		};
		for (const overrides of [
			{ isReady: false },
			{ repoUrl: "https://other.example/Group/Sub/Repo.git" },
			{ repoUrl: "https://git.example:9443/Group/Sub/Repo.git" },
			{ isReady: true, repoUrl: "https://git.example:8443/Group/Sub/Repo.git" },
		]) {
			metadata = { ...metadata, ...overrides };
			await f.render(Probe);
			expect(retry.canRetry).toBe(
				overrides.repoUrl === "https://git.example:8443/Group/Sub/Repo.git",
			);
		}
		const old = retry.retry;
		metadata = { ...metadata, isReady: false };
		await f.render(Probe);
		old();
		expect(retryCount).toBe(0);
	});
}
