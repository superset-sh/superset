import { afterEach, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register();
const { cleanup, fireEvent, render } = await import("@testing-library/react");
afterEach(cleanup);

let detail = {
	data: undefined,
	error: null as Error | null,
	isLoading: false,
	isFromHost: false,
	refetch: mock(),
};
const root = "renderer/routes/_authenticated/_dashboard";
const pane = `${root}/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/PullRequestPane`;
mock.module(`${root}/v2-workspace/providers/WorkspaceProvider`, () => ({
	useWorkspace: () => ({
		workspace: { id: "workspace", projectId: "project", hostId: "host" },
		hostUrl: "http://host.test",
	}),
}));
mock.module(`${pane}/hooks/usePullRequestPaneDetail`, () => ({
	usePullRequestPaneDetail: () => detail,
}));
mock.module("@superset/workspace-client", () => ({
	workspaceTrpc: {
		git: {
			getPullRequest: { useQuery: () => ({ data: null }) },
			getPullRequestThreads: { useQuery: () => ({ data: null }) },
		},
	},
}));
mock.module(
	`${root}/v2-workspace/$workspaceId/hooks/useReviewCommentNavigation`,
	() => ({ useReviewCommentNavigation: () => mock() }),
);
mock.module(`${root}/pull-requests/components/PullRequestDetailHeader`, () => ({
	PullRequestDetailHeader: () => null,
}));
mock.module(
	`${root}/pull-requests/components/PullRequestSummaryContent`,
	() => ({ PullRequestSummaryContent: () => null }),
);
mock.module(`${pane}/components/PullRequestComments`, () => ({
	PullRequestComments: () => null,
}));
mock.module(`${root}/components/WorkItemDetailState`, () => ({
	WorkItemDetailState: ({ message }: { message: string }) => (
		<div data-testid="summary-state">{message}</div>
	),
}));
mock.module(
	`${root}/pull-requests/$prNumber/components/PullRequestCodeTab`,
	() => ({
		PullRequestCodeTab: ({
			projectId,
			prUrl,
		}: {
			projectId: string | null;
			prUrl: string;
		}) => (
			<div data-testid="code" data-project={projectId ?? ""}>
				{prUrl}
			</div>
		),
	}),
);
const { PullRequestPane } = await import("../PullRequestPane");

for (const state of ["loading", "error"] as const) {
	test(`Code loads by PR identity while Summary is ${state}`, () => {
		detail = {
			...detail,
			isFromHost: false,
			isLoading: state === "loading",
			error: state === "error" ? new Error("GitHub App unavailable") : null,
		};
		const view = render(
			<PullRequestPane
				data={{ repoFullName: "owner/repo", number: 12 }}
				onOpenDiff={mock()}
				onOpenComment={mock()}
			/>,
		);
		expect(view.queryByTestId("code")).toBeNull();
		fireEvent.click(view.getByRole("button", { name: "Code" }));
		expect(view.getByTestId("code").textContent).toBe(
			"https://github.com/owner/repo/pull/12",
		);
		expect(view.getByTestId("code").getAttribute("data-project")).toBe("");
		expect(view.queryByTestId("summary-state")).toBeNull();
		fireEvent.click(view.getByRole("button", { name: "Summary" }));
		expect(view.getByTestId("summary-state")).toBeTruthy();
		fireEvent.click(view.getByRole("button", { name: "Code" }));
		expect(view.getByTestId("code")).toBeTruthy();
	});
}

test("matching projects retain project actions even while Summary loads", () => {
	detail = { ...detail, isFromHost: true, isLoading: true, error: null };
	const view = render(
		<PullRequestPane
			data={{ repoFullName: "owner/repo", number: 12 }}
			onOpenDiff={mock()}
			onOpenComment={mock()}
		/>,
	);
	fireEvent.click(view.getByRole("button", { name: "Code" }));
	expect(view.getByTestId("code").getAttribute("data-project")).toBe("project");
});
