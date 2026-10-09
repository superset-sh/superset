import { afterEach, expect, mock, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { observable } from "@trpc/server/observable";
import type { ReactElement } from "react";

afterEach(cleanup);

let detail = {
	data: undefined,
	error: null as Error | null,
	isLoading: false,
	projectId: null as string | null,
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
mock.module(`${root}/pull-requests/components/PullRequestActions`, () => ({
	PullRequestActions: () => null,
}));
mock.module(
	`${root}/pull-requests/components/PullRequestDetailSkeleton`,
	() => ({
		PullRequestDetailSkeleton: () => <div data-testid="summary-state" />,
	}),
);
mock.module(`${root}/pull-requests/components/PullRequestTabTitle`, () => ({
	PullRequestTabTitle: () => null,
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
mock.module(`${root}/pull-requests/components/PullRequestCodeTab`, () => ({
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
}));
const { PullRequestPane } = await import("../PullRequestPane");
const { cloudTrpc } = await import("renderer/lib/cloud-trpc");

const noPages = cloudTrpc.createClient({
	links: [
		() =>
			({ op }) =>
				observable((observer) => {
					observer.next({
						result: {
							data:
								op.path === "page.counts"
									? { all: 0 }
									: { items: [], nextCursor: null },
						},
					});
					observer.complete();
				}),
	],
});
const renderPane = (element: ReactElement) =>
	render(
		<cloudTrpc.Provider client={noPages} queryClient={new QueryClient()}>
			{element}
		</cloudTrpc.Provider>,
	);

for (const state of ["loading", "error"] as const) {
	test(`Changes loads by PR identity while Summary is ${state}`, async () => {
		detail = {
			...detail,
			projectId: null as string | null,
			isLoading: state === "loading",
			error: state === "error" ? new Error("GitHub App unavailable") : null,
		};
		const view = renderPane(
			<PullRequestPane
				data={{ repoFullName: "owner/repo", number: 12 }}
				onOpenDiff={mock()}
				onOpenComment={mock()}
				onOpenPage={mock()}
			/>,
		);
		expect(view.queryByTestId("code")).toBeNull();
		fireEvent.click(view.getByRole("button", { name: "Changes" }));
		expect((await view.findByTestId("code")).textContent).toBe(
			"https://github.com/owner/repo/pull/12",
		);
		expect(view.getByTestId("code").getAttribute("data-project")).toBe("");
		expect(view.queryByTestId("summary-state")).toBeNull();
		fireEvent.click(view.getByRole("button", { name: "Summary" }));
		expect(view.getByTestId("summary-state")).toBeTruthy();
		fireEvent.click(view.getByRole("button", { name: "Changes" }));
		expect(await view.findByTestId("code")).toBeTruthy();
	});
}

test("matching projects retain project actions even while Summary loads", async () => {
	detail = {
		...detail,
		projectId: "project",
		isLoading: true,
		error: null,
	};
	const view = renderPane(
		<PullRequestPane
			data={{ repoFullName: "owner/repo", number: 12 }}
			onOpenDiff={mock()}
			onOpenComment={mock()}
			onOpenPage={mock()}
		/>,
	);
	fireEvent.click(view.getByRole("button", { name: "Changes" }));
	expect((await view.findByTestId("code")).getAttribute("data-project")).toBe(
		"project",
	);
});
