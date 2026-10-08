import { beforeEach, expect, mock, test } from "bun:test";

const hostContent = {
	number: 12,
	url: "https://github.com/owner/repo/pull/12",
	title: "host title",
	state: "open",
	checks: [],
};
const getContent = mock(async (_input: unknown) => hostContent);
const getContentByRepo = mock(async (_input: unknown) => ({
	...hostContent,
	title: "repository title",
}));
const getPullRequest = mock(async (_input: unknown) => ({
	title: "API title",
}));
mock.module("renderer/lib/host-service-client", () => ({
	getHostServiceClientByUrl: () => ({
		pullRequests: {
			getContent: { query: getContent },
			getContentByRepo: { query: getContentByRepo },
		},
	}),
}));
mock.module("renderer/lib/cloud-trpc", () => ({
	cloudTrpcClient: {
		integration: { github: { getPullRequest: { query: getPullRequest } } },
	},
}));
const { fetchPullRequestDetail } = await import("../fetchPullRequestDetail");
const input = {
	projectId: null,
	hostUrl: "http://host.test",
	organizationId: "org",
	repoFullName: "owner/repo",
	prNumber: 12,
};
beforeEach(() => {
	getContent.mockClear();
	getContentByRepo.mockClear();
	getPullRequest.mockClear();
});
test("loads Summary through gh without a project", async () => {
	expect(await fetchPullRequestDetail(input)).toMatchObject({
		title: "repository title",
	});
	expect(getContent).not.toHaveBeenCalled();
	expect(getContentByRepo).toHaveBeenCalledWith({
		repoFullName: "owner/repo",
		prNumber: 12,
	});
	expect(getPullRequest).not.toHaveBeenCalled();
});
test("matching projects keep the existing host path", async () => {
	expect(
		(await fetchPullRequestDetail({ ...input, projectId: "project" })).title,
	).toBe("host title");
	expect(getContentByRepo).not.toHaveBeenCalled();
	expect(getPullRequest).not.toHaveBeenCalled();
});
test("tries repository gh access when the matching project path fails", async () => {
	getContent.mockRejectedValueOnce(new Error("offline"));
	expect(
		await fetchPullRequestDetail({ ...input, projectId: "project" }),
	).toMatchObject({ title: "repository title" });
	expect(getPullRequest).not.toHaveBeenCalled();
});
test("falls back when the host is absent", async () => {
	expect(
		await fetchPullRequestDetail({
			...input,
			projectId: "project",
			hostUrl: null,
		}),
	).toMatchObject({ title: "API title" });
	expect(getContent).not.toHaveBeenCalled();
});
test("preserves repository host failures if cloud fallback is unavailable", async () => {
	getContent.mockRejectedValueOnce(new Error("project unavailable"));
	getContentByRepo.mockRejectedValueOnce(new Error("offline"));
	await expect(
		fetchPullRequestDetail({
			...input,
			projectId: "project",
			organizationId: null,
		}),
	).rejects.toThrow("offline");
});

test("legacy project-only Summary works without metadata or GitHub App access", async () => {
	expect(
		(
			await fetchPullRequestDetail({
				...input,
				projectId: "project",
				repoFullName: null,
				organizationId: null,
			})
		).title,
	).toBe("host title");
	expect(getPullRequest).not.toHaveBeenCalled();
});
test("Summary does not race the API against a pending host request", async () => {
	let resolve!: (value: Awaited<ReturnType<typeof getContent>>) => void;
	getContent.mockImplementationOnce(
		() =>
			new Promise((done) => {
				resolve = done;
			}),
	);
	const request = fetchPullRequestDetail({ ...input, projectId: "project" });
	expect(getPullRequest).not.toHaveBeenCalled();
	resolve({
		number: 12,
		url: "https://github.com/owner/repo/pull/12",
		title: "host title",
		state: "open",
		checks: [],
	});
	expect((await request).title).toBe("host title");
	expect(getPullRequest).not.toHaveBeenCalled();
});
test("Summary surfaces a cloud failure instead of returning empty content", async () => {
	getContentByRepo.mockRejectedValueOnce(new Error("gh unavailable"));
	getPullRequest.mockRejectedValueOnce(new Error("Access denied"));
	await expect(fetchPullRequestDetail(input)).rejects.toThrow("Access denied");
});

test("an older host without the repository endpoint falls back to the API", async () => {
	getContent.mockRejectedValueOnce(new Error("project unavailable"));
	getContentByRepo.mockRejectedValueOnce(
		new Error('No procedure found on path "pullRequests.getContentByRepo"'),
	);
	expect(
		await fetchPullRequestDetail({ ...input, projectId: "project" }),
	).toMatchObject({ title: "API title" });
	expect(getPullRequest).toHaveBeenCalledWith({
		organizationId: "org",
		repoFullName: "owner/repo",
		number: 12,
	});
});

test("repository gh access does not require an organization or GitHub App", async () => {
	expect(
		await fetchPullRequestDetail({ ...input, organizationId: null }),
	).toMatchObject({ title: "repository title" });
	expect(getPullRequest).not.toHaveBeenCalled();
});

test("preserves legacy project failures when no repository identity is available", async () => {
	getContent.mockRejectedValueOnce(new Error("project unavailable"));
	await expect(
		fetchPullRequestDetail({
			...input,
			projectId: "project",
			repoFullName: null,
		}),
	).rejects.toThrow("project unavailable");
	expect(getContentByRepo).not.toHaveBeenCalled();
	expect(getPullRequest).not.toHaveBeenCalled();
});

test("Summary waits for repository gh access before using the API", async () => {
	let resolve!: (value: Awaited<ReturnType<typeof getContentByRepo>>) => void;
	getContentByRepo.mockImplementationOnce(
		() =>
			new Promise((done) => {
				resolve = done;
			}),
	);
	const request = fetchPullRequestDetail(input);
	expect(getPullRequest).not.toHaveBeenCalled();
	resolve({ ...hostContent, title: "repository title" });
	expect((await request).title).toBe("repository title");
	expect(getPullRequest).not.toHaveBeenCalled();
});

const { GlobalRegistrator } = await import("@happy-dom/global-registrator");
if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register();
const { renderHook, waitFor, cleanup } = await import("@testing-library/react");
const { createElement } = await import("react");
const { QueryClient, QueryClientProvider } = await import(
	"@tanstack/react-query"
);
const { afterEach } = await import("bun:test");
afterEach(cleanup);
let hostProjects: {
	projects: Array<{
		id: string;
		projectKey: string;
		repoOwner?: string;
		repoName?: string;
	}>;
	isReady: boolean;
} = { projects: [], isReady: false };
mock.module("renderer/hooks/host-projects/useHostProjects", () => ({
	useHostProjects: () => hostProjects,
}));
mock.module("renderer/hooks/useActiveOrganizationId", () => ({
	useActiveOrganizationId: () => "org",
}));
mock.module(
	"renderer/providers/ElectronTRPCProvider/ElectronTRPCProvider",
	() => ({ electronQueryClient: new QueryClient() }),
);
mock.module(
	"renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/useDashboardSidebarData/derivePullRequestQueryTargets",
	() => ({ DASHBOARD_SIDEBAR_PULL_REQUEST_QUERY_KEY_PREFIX: ["sidebar-prs"] }),
);
mock.module(
	"renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces/useAccessibleV2Workspaces",
	() => ({ V2_WORKSPACES_PULL_REQUEST_QUERY_KEY_PREFIX: ["workspace-prs"] }),
);
const { usePullRequestDetail } = await import("../../../usePullRequestDetail");
function mountDetail(
	repoFullName: string | null,
	hostUrl: string | null = "http://host.test",
) {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return renderHook(
		() =>
			usePullRequestDetail({
				projectId: "project",
				repoFullName,
				hostUrl,
				prNumber: 12,
			}),
		{
			wrapper: ({ children }) =>
				createElement(QueryClientProvider, { client }, children),
		},
	);
}

test("waits for project discovery, then uses the original matching host path", async () => {
	hostProjects = { projects: [], isReady: false };
	const view = mountDetail("owner/repo");
	expect(view.result.current.isResolvingProject).toBe(true);
	expect(getContent).not.toHaveBeenCalled();
	expect(getPullRequest).not.toHaveBeenCalled();
	hostProjects = {
		projects: [
			{
				id: "project",
				projectKey: "project",
				repoOwner: "owner",
				repoName: "repo",
			},
		],
		isReady: true,
	};
	view.rerender();
	await waitFor(() =>
		expect(view.result.current.data?.title).toBe("host title"),
	);
	expect(getPullRequest).not.toHaveBeenCalled();
});

test("project-only links derive repository identity from the host response when metadata is missing", async () => {
	hostProjects = {
		projects: [{ id: "project", projectKey: "project" }],
		isReady: true,
	};
	const view = mountDetail(null);
	await waitFor(() =>
		expect(view.result.current.data?.title).toBe("host title"),
	);
	expect(view.result.current.repoFullName).toBe("owner/repo");
	expect(view.result.current.projectId).toBe("project");
	expect(getPullRequest).not.toHaveBeenCalled();
});

test("uses repository gh access after project discovery confirms the project is absent", async () => {
	hostProjects = { projects: [], isReady: true };
	const view = mountDetail("owner/repo");
	await waitFor(() =>
		expect(view.result.current.data?.title).toBe("repository title"),
	);
	expect(getContent).not.toHaveBeenCalled();
	expect(view.result.current.projectId).toBeNull();
});

test("a legacy link with no host or repository fails instead of loading forever", async () => {
	hostProjects = {
		projects: [{ id: "project", projectKey: "project" }],
		isReady: true,
	};
	const view = mountDetail(null, null);
	await waitFor(() => expect(view.result.current.isError).toBe(true));
	expect(view.result.current.isLoading).toBe(false);
	expect(getContent).not.toHaveBeenCalled();
	expect(getPullRequest).not.toHaveBeenCalled();
});

test("retains the repository gh failure when the cloud fallback also fails", async () => {
	const hostError = new Error("gh: diff exceeds the maximum number of lines");
	const cloudError = new Error("Not Found - installation access token");
	getContentByRepo.mockRejectedValueOnce(hostError);
	getPullRequest.mockRejectedValueOnce(cloudError);
	await expect(fetchPullRequestDetail(input)).rejects.toMatchObject({
		name: "AggregateError",
		message: `${hostError.message}\n${cloudError.message}`,
		errors: [hostError, cloudError],
	});
});

test("preserves the original cloud error when an older host lacks the endpoint", async () => {
	const hostError = Object.assign(new Error("Unsupported procedure"), {
		data: { code: "NOT_FOUND" },
	});
	const cloudError = new Error("Repository access denied");
	getContentByRepo.mockRejectedValueOnce(hostError);
	getPullRequest.mockRejectedValueOnce(cloudError);
	await expect(fetchPullRequestDetail(input)).rejects.toBe(cloudError);
});

test("preserves the original cloud error when no host was tried", async () => {
	const cloudError = new Error("Repository access denied");
	getPullRequest.mockRejectedValueOnce(cloudError);
	await expect(
		fetchPullRequestDetail({ ...input, hostUrl: null }),
	).rejects.toBe(cloudError);
	expect(getContentByRepo).not.toHaveBeenCalled();
});
