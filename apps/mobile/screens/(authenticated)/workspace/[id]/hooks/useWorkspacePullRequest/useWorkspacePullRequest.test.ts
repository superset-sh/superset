import { afterEach, expect, test } from "bun:test";
import {
	mobileM2Fixture,
	runMobileM2Child,
} from "../../../../../../hooks/useOpenLink/testFixture.test";

if (process.env.TEST_MOBILE_M2 !== "1") {
	test(
		"actual mobile consumer in owned child",
		() => runMobileM2Child(import.meta.path),
		30000,
	);
} else {
	const f = await mobileM2Fixture();
	afterEach(f.cleanup);
	const { useWorkspacePullRequests, getWorkspacePullRequestsQueryKey } =
		await import("./useWorkspacePullRequest");
	let rows!: ReturnType<typeof useWorkspacePullRequests>;
	function Probe() {
		rows = useWorkspacePullRequests("workspace");
		return null;
	}
	test("native history derives authority and isolates two instances", async () => {
		f.state.history = [
			f.nativeRow,
			{
				...f.nativeRow,
				url: f.nativeUrl.replace("git.example", "other.example"),
			},
		];
		await f.render(Probe);
		expect(rows.map((r) => r.key)).toEqual([
			`gitlab:${f.nativeUrl}`,
			`gitlab:${f.nativeUrl.replace("git.example", "other.example")}`,
		]);
		expect(rows[0]).toMatchObject({
			provider: "gitlab",
			host: "git.example:8443",
			expectedUrl: f.nativeUrl,
		});
	});
	test("same-host native history survives a failed background refresh", async () => {
		f.state.history = [f.nativeRow];
		await f.render(Probe);
		f.state.deferred = Promise.reject(new Error("refresh unavailable"));
		await f.React.act(async () => {
			await f.client.invalidateQueries({
				queryKey: getWorkspacePullRequestsQueryKey("workspace"),
			});
		});
		await f.settle();
		expect(rows[0]?.expectedUrl).toBe(f.nativeUrl);
	});
	test("contradictory native row is omitted", async () => {
		f.state.history = [{ ...f.nativeRow, repoName: "Other" }];
		await f.render(Probe);
		expect(rows).toEqual([]);
	});
	test("owning host transition hides old native rows and fetches new host", async () => {
		f.state.history = [f.nativeRow];
		await f.render(Probe);
		expect(rows).toHaveLength(1);
		let resolve!: (value: unknown) => void;
		f.state.deferred = new Promise((r) => (resolve = r));
		f.state.host = { ...f.state.host, machineId: "other" };
		await f.render(Probe);
		expect(rows).toEqual([]);
		expect(f.state.requests.at(-1)?.url).toBe(
			"https://broker.example/org/other",
		);
		await f.React.act(async () =>
			resolve({ workspaces: [{ pullRequests: [] }] }),
		);
		await f.settle();
		expect(rows).toEqual([]);
	});
	test("GH default history retains row key and query key", async () => {
		f.state.deferred = null;
		f.state.history = [f.githubRow];
		await f.render(Probe);
		expect(rows[0]?.key).toBe("Owner/Repo#17");
		expect(getWorkspacePullRequestsQueryKey("workspace")).toEqual([
			"workspace-pull-request-history",
			"workspace",
		]);
		expect(rows[0]).not.toHaveProperty("provider");
	});
	test("failed new owning host cannot expose old native rows or refetch in a loop", async () => {
		f.state.history = [f.nativeRow];
		await f.render(Probe);
		let reject!: (error: Error) => void;
		f.state.deferred = new Promise((_resolve, r) => (reject = r));
		f.state.host = { ...f.state.host, machineId: "other" };
		await f.render(Probe);
		expect(rows).toEqual([]);
		await f.React.act(async () => reject(Error("owned host refusal")));
		await f.settle();
		await f.settle();
		expect(rows).toEqual([]);
		expect(f.state.requests).toHaveLength(2);
	});
	test("fresh cached GH history fetches a changed owning host's native rows immediately", async () => {
		f.state.history = [f.githubRow];
		await f.render(Probe);
		expect(rows[0]?.key).toBe("Owner/Repo#17");
		f.state.history = [f.nativeRow];
		f.state.host = { ...f.state.host, machineId: "other" };
		await f.render(Probe);
		expect(f.state.requests).toHaveLength(2);
		expect(f.state.requests.at(-1)?.url).toBe(
			"https://broker.example/org/other",
		);
		expect(rows[0]?.provider).toBe("gitlab");
		expect(rows[0]?.expectedUrl).toBe(f.nativeUrl);
	});
}
