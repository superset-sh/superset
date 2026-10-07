import { expect, mock, test } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: Own the cleared test child's scratch directory.
import { mkdtempSync, rmSync } from "node:fs";

if (process.env.SUPERSET_ISSUE_FETCH_FIXTURE !== "1") {
	test("native issue fetch uses isolated transport boundaries", () => {
		const cwd = mkdtempSync("/tmp/superset-issue-fetch-");
		try {
			const child = Bun.spawnSync(
				[process.execPath, "--no-env-file", "test", import.meta.path],
				{
					cwd,
					env: {
						PATH: process.env.PATH,
						TMPDIR: "/tmp",
						SUPERSET_ISSUE_FETCH_FIXTURE: "1",
					},
					stdout: "pipe",
					stderr: "pipe",
					timeout: 20000,
				},
			);
			process.stdout.write(child.stdout);
			process.stderr.write(child.stderr);
			expect(child.exitCode).toBe(0);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	}, 25000);
} else {
	globalThis.fetch = Object.assign(
		async () => {
			throw Error("Outbound denied");
		},
		{ preconnect: () => {} },
	);
	mock.module("renderer/lib/api-trpc-client", () => ({ apiTrpcClient: {} }));
	let result: Record<string, unknown> = {};
	let calls: unknown[] = [];
	mock.module("renderer/lib/host-service-client", () => ({
		getHostServiceClientByUrl: (host: string) => ({
			pullRequests: {
				getContent: {
					query: async (input: unknown) => {
						calls.push({ host, input });
						return result;
					},
				},
			},
			issues: {
				getContent: {
					query: async (input: unknown) => {
						calls.push({ host, input });
						return result;
					},
				},
			},
		}),
	}));
	const { fetchPrBody, fetchGitLabIssueBody, fetchGitHubIssueBody } =
		await import("./fetchers");
	const url = "https://git.example:8443/Group/Sub/Repo/-/issues/7";
	const args = {
		host: "git.example:8443",
		owner: "Group/Sub",
		repo: "Repo",
		issueNumber: 7,
		expectedIssueUrl: url,
		projectId: "p",
		hostId: "h",
		hostUrl: "https://relay.example/h",
	};
	const valid = () => ({
		provider: "gitlab",
		expectedIssueUrl: url,
		url,
		number: 7,
		body: "  Native body  ",
	});
	test("native acknowledgment and exact serving target reach the real fetcher", async () => {
		calls = [];
		result = valid();
		expect(await fetchGitLabIssueBody(args)).toEqual({ text: "Native body" });
		expect(calls).toEqual([
			{
				host: args.hostUrl,
				input: { projectId: "p", issueNumber: 7, expectedIssueUrl: url },
			},
		]);
	});
	test.each([
		"provider",
		"expectedIssueUrl",
		"url",
		"number",
	])("contradictory %s refuses", async (field) => {
		result = { ...valid(), [field]: field === "number" ? 8 : "wrong" };
		expect(await fetchGitLabIssueBody(args)).toBeNull();
	});
	test("older host without expectation acknowledgment refuses", async () => {
		result = { number: 7, url, body: "Wrong provider body" };
		expect(await fetchGitLabIssueBody(args)).toBeNull();
	});
	test("invalid reference refuses before transport", async () => {
		calls = [];
		expect(
			await fetchGitLabIssueBody({ ...args, owner: "group/Sub" }),
		).toBeNull();
		expect(calls).toEqual([]);
	});
	test("empty native description is verified rather than failed", async () => {
		result = { ...valid(), body: "" };
		expect(await fetchGitLabIssueBody(args)).toEqual({ text: "" });
	});
	test("equivalent unreserved path encoding keeps the same returned native identity", async () => {
		result = { ...valid(), url: url.replace("Sub", "%53ub") };
		expect(await fetchGitLabIssueBody(args)).toEqual({ text: "Native body" });
	});
	test.each([
		undefined,
		null,
	])("malformed native body %s cannot become verified empty context", async (body) => {
		result = { ...valid(), body };
		expect(await fetchGitLabIssueBody(args)).toBeNull();
	});
	test("GH fetch retains original input, trimming and empty-body default", async () => {
		calls = [];
		result = { body: " GH body " };
		expect(await fetchGitHubIssueBody(args)).toEqual({ text: "GH body" });
		expect(calls).toEqual([
			{ host: args.hostUrl, input: { projectId: "p", issueNumber: 7 } },
		]);
		result = { body: "" };
		expect(await fetchGitHubIssueBody(args)).toBeNull();
	});
	test("linked native MR reads explicit provider and refuses another instance body", async () => {
		const expectedUrl =
			"https://git.example:8443/Group/Sub/Repo/-/merge_requests/7";
		calls = [];
		result = { url: expectedUrl, body: " Native MR body " };
		expect(
			await fetchPrBody({
				prNumber: 7,
				projectId: "p",
				hostUrl: args.hostUrl,
				expectedUrl,
			}),
		).toEqual({ text: "Native MR body" });
		expect(calls).toEqual([
			{
				host: args.hostUrl,
				input: {
					projectId: "p",
					prNumber: 7,
					provider: "gitlab",
					expectedPullRequest: {
						projectId: "p",
						provider: "gitlab",
						host: "git.example:8443",
						owner: "Group/Sub",
						repo: "Repo",
						pullNumber: 7,
						expectedUrl,
					},
				},
			},
		]);
		result = {
			...result,
			url: expectedUrl.replace("git.example", "other.example"),
		};
		expect(
			await fetchPrBody({
				prNumber: 7,
				projectId: "p",
				hostUrl: args.hostUrl,
				expectedUrl,
			}),
		).toBeNull();
	});
}
