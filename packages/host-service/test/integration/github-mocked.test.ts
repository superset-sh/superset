import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createTestHost, type TestHost } from "../helpers/createTestHost";

describe("github router with mocked Octokit", () => {
	let host: TestHost;
	const calls: Array<{ method: string; args: unknown }> = [];

	const fakeOctokit = {
		pulls: {
			list: async (args: unknown) => {
				calls.push({ method: "pulls.list", args });
				return {
					data: [
						{
							number: 1,
							title: "Open PR",
							state: "open",
							head: { ref: "feature/x" },
						},
					],
				};
			},
			get: async (args: unknown) => {
				calls.push({ method: "pulls.get", args });
				return {
					data: {
						number: 42,
						title: "PR 42",
						state: "open",
						body: "hello",
					},
				};
			},
		},
		repos: {
			get: async (args: unknown) => {
				calls.push({ method: "repos.get", args });
				return {
					data: {
						id: 1,
						name: "hello",
						full_name: "octocat/hello",
						default_branch: "main",
					},
				};
			},
		},
	};

	beforeEach(async () => {
		calls.length = 0;
		host = await createTestHost({
			githubFactory: async () => fakeOctokit,
		});
	});

	afterEach(async () => {
		await host.dispose();
	});

	test("getPRStatus delegates to octokit.pulls.list and returns the first row", async () => {
		const result = await host.trpc.github.getPRStatus.query({
			owner: "octocat",
			repo: "hello",
			branch: "feature/x",
		});
		expect(result).not.toBeNull();
		expect(result?.number).toBe(1);
		expect(calls).toHaveLength(1);
		expect(calls[0].method).toBe("pulls.list");
		expect(calls[0].args).toMatchObject({
			owner: "octocat",
			repo: "hello",
			head: "octocat:feature/x",
			state: "open",
		});
	});

	test("getPR delegates to octokit.pulls.get with pull_number", async () => {
		const result = await host.trpc.github.getPR.query({
			owner: "octocat",
			repo: "hello",
			pullNumber: 42,
		});
		expect(result.number).toBe(42);
		expect(calls[0].method).toBe("pulls.get");
		expect(calls[0].args).toMatchObject({
			owner: "octocat",
			repo: "hello",
			pull_number: 42,
		});
	});

	test("listPRs forwards pagination params to octokit", async () => {
		await host.trpc.github.listPRs.query({
			owner: "octocat",
			repo: "hello",
			state: "all",
			perPage: 10,
			page: 2,
		});
		expect(calls[0].method).toBe("pulls.list");
		expect(calls[0].args).toMatchObject({
			state: "all",
			per_page: 10,
			page: 2,
		});
	});

	test("getRepo delegates to octokit.repos.get", async () => {
		const result = await host.trpc.github.getRepo.query({
			owner: "octocat",
			repo: "hello",
		});
		expect(result.full_name).toBe("octocat/hello");
		expect(calls[0].method).toBe("repos.get");
	});
});
