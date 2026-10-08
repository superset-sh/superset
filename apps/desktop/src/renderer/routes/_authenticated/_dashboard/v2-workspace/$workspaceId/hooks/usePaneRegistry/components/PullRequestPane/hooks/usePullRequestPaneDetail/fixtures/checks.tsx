import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import type { PullRequestProject } from "renderer/routes/_authenticated/_dashboard/pull-requests/utils/resolvePullRequestTarget";

if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register();
const { cleanup, renderHook, waitFor } = await import("@testing-library/react");
const { QueryClient, QueryClientProvider } = await import(
	"@tanstack/react-query"
);
afterEach(cleanup);

let workspaceProjectId: string | null = "sandbox-project";
let projectQuery: { data?: PullRequestProject | null; isPending: boolean };
let hostProjects: { projects: PullRequestProject[]; isReady: boolean };
const workspaceProjectQuery = mock(() => projectQuery);
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
const root = "renderer/routes/_authenticated/_dashboard";
mock.module("@superset/workspace-client", () => ({
	workspaceTrpc: {
		project: { get: { useQuery: workspaceProjectQuery } },
	},
}));
mock.module(`${root}/v2-workspace/providers/WorkspaceProvider`, () => ({
	useWorkspace: () => ({
		workspace: { projectId: workspaceProjectId },
		hostUrl: "https://sandbox.test",
	}),
}));
mock.module("renderer/hooks/host-projects/useHostProjects", () => ({
	useHostProjects: () => hostProjects,
}));
mock.module("renderer/hooks/useActiveOrganizationId", () => ({
	useActiveOrganizationId: () => "org",
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
mock.module(
	"renderer/providers/ElectronTRPCProvider/ElectronTRPCProvider",
	() => ({ electronQueryClient: new QueryClient() }),
);
mock.module(
	`${root}/components/DashboardSidebar/hooks/useDashboardSidebarData/derivePullRequestQueryTargets`,
	() => ({ DASHBOARD_SIDEBAR_PULL_REQUEST_QUERY_KEY_PREFIX: ["sidebar-prs"] }),
);
mock.module(
	`${root}/v2-workspaces/hooks/useAccessibleV2Workspaces/useAccessibleV2Workspaces`,
	() => ({ V2_WORKSPACES_PULL_REQUEST_QUERY_KEY_PREFIX: ["workspace-prs"] }),
);
const { usePullRequestPaneDetail } = await import(
	"../usePullRequestPaneDetail"
);
const { usePullRequestDetail } = await import(
	"renderer/routes/_authenticated/_dashboard/pull-requests/hooks/usePullRequestDetail"
);

beforeEach(() => {
	workspaceProjectId = "sandbox-project";
	projectQuery = {
		data: { id: "sandbox-project", repoOwner: "owner", repoName: "repo" },
		isPending: false,
	};
	hostProjects = { projects: [], isReady: false };
	workspaceProjectQuery.mockClear();
	getContent.mockClear();
	getContentByRepo.mockClear();
	getPullRequest.mockClear();
});

function mountDetail(
	useDetail = () =>
		usePullRequestPaneDetail({ repoFullName: "owner/repo", number: 12 }),
) {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return renderHook(useDetail, {
		wrapper: ({ children }) => (
			<QueryClientProvider client={client}>{children}</QueryClientProvider>
		),
	});
}

test("cloud projects keep the original host path without desktop discovery", async () => {
	const view = mountDetail();
	await waitFor(() =>
		expect(view.result.current.data?.title).toBe("host title"),
	);
	expect(view.result.current.projectId).toBe("sandbox-project");
	expect(view.result.current.isResolvingProject).toBe(false);
	expect(workspaceProjectQuery).toHaveBeenCalledWith(
		{ projectId: "sandbox-project" },
		{ enabled: true },
	);
	expect(getContent).toHaveBeenCalledWith({
		projectId: "sandbox-project",
		prNumber: 12,
	});
	expect(getContentByRepo).not.toHaveBeenCalled();
	expect(getPullRequest).not.toHaveBeenCalled();
});

test("waits for the workspace project even if desktop discovery has a match", async () => {
	hostProjects = {
		projects: [projectQuery.data as PullRequestProject],
		isReady: true,
	};
	projectQuery = { isPending: true };
	const view = mountDetail();
	expect(view.result.current.isResolvingProject).toBe(true);
	expect(getContent).not.toHaveBeenCalled();
	expect(getContentByRepo).not.toHaveBeenCalled();
	projectQuery = {
		data: { id: "sandbox-project", repoOwner: "other", repoName: "repo" },
		isPending: false,
	};
	view.rerender();
	await waitFor(() =>
		expect(view.result.current.data?.title).toBe("repository title"),
	);
	expect(view.result.current.projectId).toBeNull();
	expect(getContent).not.toHaveBeenCalled();
	expect(getPullRequest).not.toHaveBeenCalled();
});

for (const data of [undefined, null]) {
	test(`a settled ${data === null ? "missing" : "failed"} workspace project uses repository fallback`, async () => {
		hostProjects = {
			projects: [projectQuery.data as PullRequestProject],
			isReady: false,
		};
		projectQuery = { data, isPending: false };
		const view = mountDetail();
		await waitFor(() =>
			expect(view.result.current.data?.title).toBe("repository title"),
		);
		expect(view.result.current.projectId).toBeNull();
		expect(view.result.current.isResolvingProject).toBe(false);
		expect(getContent).not.toHaveBeenCalled();
	});
}

test("a workspace without a project does not wait for its disabled project query", async () => {
	workspaceProjectId = null;
	projectQuery = { isPending: true };
	const view = mountDetail();
	await waitFor(() =>
		expect(view.result.current.data?.title).toBe("repository title"),
	);
	expect(view.result.current.projectId).toBeNull();
	expect(workspaceProjectQuery).toHaveBeenCalledWith(
		{ projectId: "" },
		{ enabled: false },
	);
});

test("known project-only links preserve legacy reads when metadata is absent", async () => {
	projectQuery = { data: { id: "sandbox-project" }, isPending: false };
	const view = mountDetail(() =>
		usePullRequestDetail({
			projectId: "sandbox-project",
			projectQuery,
			hostUrl: "https://sandbox.test",
			prNumber: 12,
		}),
	);
	await waitFor(() =>
		expect(view.result.current.data?.title).toBe("host title"),
	);
	expect(view.result.current.projectId).toBe("sandbox-project");
	expect(view.result.current.repoFullName).toBe("owner/repo");
	expect(getContentByRepo).not.toHaveBeenCalled();
});

test("explicit repository links cannot inherit project actions from missing metadata", async () => {
	projectQuery = { data: { id: "sandbox-project" }, isPending: false };
	const view = mountDetail();
	await waitFor(() =>
		expect(view.result.current.data?.title).toBe("repository title"),
	);
	expect(view.result.current.projectId).toBeNull();
	expect(getContent).not.toHaveBeenCalled();
});
