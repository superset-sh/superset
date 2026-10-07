import { describe, expect, mock, test } from "bun:test";
import type { HostServiceClient } from "renderer/lib/host-service-client";
import {
	queryIssueSearchCapabilities,
	queryPullRequestSearchCapabilities,
} from "./queryRepoSearchCapabilities";

type CapabilityQuery =
	HostServiceClient["workspaceCreation"]["getIssueSearchCapabilities"]["query"];
type Capabilities = Awaited<ReturnType<CapabilityQuery>>;

const missing = new Error(
	'No procedure found on path "workspaceCreation.getIssueSearchCapabilities"',
);
const github = {
	repoUrl: "https://github.com/acme/widget.git",
	repoOwner: "acme",
	repoName: "widget",
};
function client(project: object | null = github, failure: unknown = missing) {
	const lookup = mock(async () => project);
	const query = mock(
		async (_input: Parameters<CapabilityQuery>[0]): Promise<Capabilities> => {
			throw failure;
		},
	);
	return {
		lookup,
		query,
		value: {
			project: { get: { query: lookup } },
			workspaceCreation: {
				getIssueSearchCapabilities: { query },
				getPullRequestSearchCapabilities: { query },
			},
		} as unknown as HostServiceClient,
	};
}

describe("older host search capabilities", () => {
	test("batches every unique project without exceeding the host's 100-project bound", async () => {
		const host = client();
		const received: string[][] = [];
		host.query.mockImplementation(async (input: { projectIds: string[] }) => {
			received.push(input.projectIds);
			if (input.projectIds.length > 100) throw new Error("Too many projects");
			return input.projectIds.map((projectId): Capabilities[number] => ({
				projectId,
				provider: "gitlab",
			}));
		});
		const ids = Array.from({ length: 205 }, (_, i) => `project-${i}`);
		expect(
			(
				await queryIssueSearchCapabilities(host.value, [
					...ids,
					ids[0] ?? "missing",
				])
			).map((row) => row.projectId),
		).toEqual(ids);
		expect(received.map((batch) => batch.length)).toEqual([100, 100, 5]);
	});
	test("restores GitHub issue search using the selected host's legacy identity", async () => {
		const host = client();
		expect(await queryIssueSearchCapabilities(host.value, ["project"])).toEqual(
			[
				{
					projectId: "project",
					provider: "github",
					host: "github.com",
					projectPath: "acme/widget",
				},
			],
		);
		expect(host.lookup).toHaveBeenCalledWith({ projectId: "project" });
	});
	test("recognizes a structured NOT_FOUND missing-procedure response", async () => {
		const host = client(github, {
			data: { code: "NOT_FOUND" },
			message: missing.message,
		});
		expect(
			(await queryIssueSearchCapabilities(host.value, ["project"]))[0]
				?.provider,
		).toBe("github");
	});
	test("restores existing GitHub review filters on an older host", async () => {
		const host = client();
		expect(
			await queryPullRequestSearchCapabilities(host.value, ["project"]),
		).toEqual([
			{
				projectId: "project",
				provider: "github",
				host: "github.com",
				projectPath: "acme/widget",
				reviewSemantics: "history",
				teamReviewRequests: true,
				approvalRules: "available",
			},
		]);
	});
	test("accepts legacy GitHub owner/name when the host has no URL", async () => {
		const host = client({
			repoOwner: "acme",
			repoName: "widget",
			repoUrl: null,
		});
		expect(
			(await queryIssueSearchCapabilities(host.value, ["project"]))[0]
				?.provider,
		).toBe("github");
	});
	test.each([
		{
			repoUrl: "https://gitlab.com/group/widget",
			repoOwner: "group",
			repoName: "widget",
		},
		{ repoUrl: "https://git.example/group/widget", repoProvider: "gitlab" },
		{ ...github, repoProvider: "gitlab" },
		{ repoUrl: "https://other.example/acme/widget", repoProvider: "github" },
		{ repoUrl: "not a URL", repoOwner: "acme", repoName: "widget" },
		{ repoUrl: null, repoOwner: null, repoName: null },
		null,
	])("does not infer GitHub for unsupported or unknown identity %j", async (project) => {
		const host = client(project);
		await expect(
			queryIssueSearchCapabilities(host.value, ["project"]),
		).rejects.toBe(missing);
	});
	test.each([
		new Error("Network connection lost"),
		{ data: { code: "UNAUTHORIZED" }, message: "Authentication required" },
		{ data: { code: "UNAUTHORIZED" }, message: missing.message },
		{ data: { code: "NOT_FOUND" }, message: "Project not found" },
		{ data: { code: "INTERNAL_SERVER_ERROR" }, message: "Host lookup failed" },
	])("preserves real capability failures %j", async (failure) => {
		const host = client(github, failure);
		await expect(
			queryPullRequestSearchCapabilities(host.value, ["project"]),
		).rejects.toBe(failure);
		expect(host.lookup).not.toHaveBeenCalled();
	});
	test("preserves errors from the legacy identity lookup", async () => {
		const host = client();
		const failure = new Error("Identity lookup disconnected");
		host.lookup.mockImplementation(async () => {
			throw failure;
		});
		await expect(
			queryIssueSearchCapabilities(host.value, ["project"]),
		).rejects.toBe(failure);
	});
	test("uses new host capabilities without reading legacy identity", async () => {
		const host = client();
		const capabilities: Capabilities = [
			{ projectId: "project", provider: "gitlab", host: "gitlab.com" },
		];
		host.query.mockImplementation(async () => capabilities);
		expect(await queryIssueSearchCapabilities(host.value, ["project"])).toBe(
			capabilities,
		);
		expect(host.lookup).not.toHaveBeenCalled();
	});
});
