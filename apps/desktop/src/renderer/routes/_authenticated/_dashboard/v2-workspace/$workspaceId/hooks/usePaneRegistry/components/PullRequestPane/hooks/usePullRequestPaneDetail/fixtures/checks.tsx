import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import type { PullRequestProject } from "renderer/routes/_authenticated/_dashboard/pull-requests/utils/resolvePullRequestTarget";
import { cloudPullRequestRead } from "renderer/routes/_authenticated/_dashboard/pull-requests/utils/toPullRequestDetail/fixtures";

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
const getPullRequestDetail = mock(async (_input: unknown) =>
	cloudPullRequestRead({ title: "viewer title" }),
);
const hostRead = mock(() => {
	throw new Error("the workspace host must not be asked");
});
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
	getHostServiceClientByUrl: hostRead,
}));
mock.module("renderer/lib/trpc-client", () => ({
	electronTrpcClient: {
		viewerGithub: { status: { query: async () => ({ available: false }) } },
	},
}));
mock.module("renderer/lib/cloud-trpc", () => ({
	cloudTrpcClient: {
		integration: {
			github: { getPullRequestDetail: { query: getPullRequestDetail } },
		},
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

beforeEach(() => {
	workspaceProjectId = "sandbox-project";
	projectQuery = {
		data: { id: "sandbox-project", repoOwner: "owner", repoName: "repo" },
		isPending: false,
	};
	hostProjects = { projects: [], isReady: false };
	workspaceProjectQuery.mockClear();
	getPullRequestDetail.mockClear();
});

function mountDetail() {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return renderHook(
		() => usePullRequestPaneDetail({ repoFullName: "owner/repo", number: 12 }),
		{
			wrapper: ({ children }) => (
				<QueryClientProvider client={client}>{children}</QueryClientProvider>
			),
		},
	);
}

test("reads the pull request by identity as the viewer, never through the workspace host", async () => {
	const view = mountDetail();
	await waitFor(() =>
		expect(view.result.current.data?.title).toBe("viewer title"),
	);
	expect(getPullRequestDetail).toHaveBeenCalledWith({
		organizationId: "org",
		repoFullName: "owner/repo",
		number: 12,
		activity: true,
	});
	expect(hostRead).not.toHaveBeenCalled();
	// The matching project is kept for agents and workspaces on the host.
	expect(view.result.current.projectId).toBe("sandbox-project");
});

test("waits for the workspace project before naming the project", async () => {
	projectQuery = { isPending: true };
	const view = mountDetail();
	expect(view.result.current.isResolvingProject).toBe(true);
	expect(getPullRequestDetail).not.toHaveBeenCalled();
	projectQuery = {
		data: { id: "sandbox-project", repoOwner: "other", repoName: "repo" },
		isPending: false,
	};
	view.rerender();
	await waitFor(() =>
		expect(view.result.current.data?.title).toBe("viewer title"),
	);
	expect(view.result.current.projectId).toBeNull();
});

test("a workspace without a project still reads the pull request", async () => {
	workspaceProjectId = null;
	projectQuery = { isPending: true };
	const view = mountDetail();
	await waitFor(() =>
		expect(view.result.current.data?.title).toBe("viewer title"),
	);
	expect(view.result.current.projectId).toBeNull();
	expect(workspaceProjectQuery).toHaveBeenCalledWith(
		{ projectId: "" },
		{ enabled: false },
	);
});
