import { afterEach, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import type { ReactNode } from "react";

if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register();
const { cleanup, fireEvent, render, waitFor } = await import(
	"@testing-library/react"
);
afterEach(cleanup);
const root = "renderer/routes/_authenticated/_dashboard";
let search: { repo?: string; project?: string } = { repo: "other/repo" };
let detail = {
	projectId: null as string | null,
	repoFullName: "other/repo" as string | null,
	isResolvingProject: false,
	data: undefined as undefined | { url: string },
	isLoading: false,
	error: new Error("Summary unavailable"),
	refetch: mock(),
};
mock.module("@tanstack/react-router", () => ({
	createFileRoute: () => (options: unknown) => ({
		options,
		useParams: () => ({ prNumber: "12" }),
	}),
}));
mock.module(`${root}/pull-requests/layout`, () => ({
	Route: { useSearch: () => search },
}));
mock.module(`${root}/hooks/useProjectHost`, () => ({
	useProjectHost: () => ({ hostId: null }),
}));
mock.module("renderer/hooks/host-service/useHostTargetUrl", () => ({
	useHostUrl: () => "http://host.test",
}));
const read = mock(() => detail);
mock.module(`${root}/pull-requests/hooks/usePullRequestDetail`, () => ({
	usePullRequestDetail: read,
}));
mock.module(`${root}/components/PageHeader`, () => ({
	PageHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
mock.module(`${root}/pull-requests/components/PullRequestListToggle`, () => ({
	PullRequestListToggle: () => null,
}));
mock.module(`${root}/pull-requests/components/PullRequestActions`, () => ({
	PullRequestActions: ({ projectId }: { projectId: string | null }) => (
		<div data-testid="header" data-project={projectId ?? ""} />
	),
}));
mock.module(
	`${root}/pull-requests/components/PullRequestDetailSkeleton`,
	() => ({
		PullRequestDetailSkeleton: () => <div data-testid="detail-skeleton" />,
	}),
);
mock.module(`${root}/pull-requests/components/PullRequestTabTitle`, () => ({
	PullRequestTabTitle: () => null,
}));
mock.module(
	`${root}/pull-requests/components/PullRequestSummaryContent`,
	() => ({ PullRequestSummaryContent: () => <div data-testid="summary" /> }),
);
mock.module(`${root}/components/WorkItemDetailState`, () => ({
	WorkItemDetailState: ({ message }: { message: string }) => (
		<div>{message}</div>
	),
}));
mock.module(`${root}/pull-requests/components/PullRequestCodeTab`, () => ({
	PullRequestCodeTab: ({
		prUrl,
		projectId,
	}: {
		prUrl: string;
		projectId: string | null;
	}) => (
		<div data-testid="code" data-project={projectId ?? ""}>
			{prUrl}
		</div>
	),
}));
const { Route } = await import("../page");
const Page = Route.options.component as () => ReactNode;
for (const project of [undefined, "unrelated", "removed"]) {
	test(`Changes loads without relying on project ${project}`, async () => {
		search = { repo: "other/repo", project };
		const view = render(<Page />);
		expect(read).toHaveBeenLastCalledWith({
			projectId: project ?? null,
			repoFullName: "other/repo",
			hostUrl: "http://host.test",
			prNumber: 12,
		});
		fireEvent.click(view.getByRole("button", { name: "Changes" }));
		expect((await view.findByTestId("code")).textContent).toBe(
			"https://github.com/other/repo/pull/12",
		);
		expect(view.getByTestId("code").getAttribute("data-project")).toBe("");
		expect(view.getByTestId("header").getAttribute("data-project")).toBe("");
		fireEvent.click(view.getByRole("button", { name: "Summary" }));
		expect(view.queryByTestId("code")).toBeNull();
		fireEvent.click(view.getByRole("button", { name: "Changes" }));
		expect(await view.findByTestId("code")).toBeTruthy();
	});
}
test("keeps the canonical URL and Summary mounted across tab changes", async () => {
	detail = {
		...detail,
		data: { url: "https://github.com/canonical/repo/pull/12" },
	};
	const view = render(<Page />);
	const summary = view.getByTestId("summary");
	fireEvent.click(view.getByRole("button", { name: "Changes" }));
	expect((await view.findByTestId("code")).textContent).toBe(
		detail.data?.url ?? "",
	);
	expect(view.getByTestId("summary")).toBe(summary);
});

test("Changes waits for project discovery before choosing a fallback", async () => {
	detail = {
		...detail,
		data: undefined,
		projectId: null,
		repoFullName: "other/repo",
		isLoading: true,
		isResolvingProject: true,
	};
	const view = render(<Page />);
	fireEvent.click(view.getByRole("button", { name: "Changes" }));
	expect(view.queryByTestId("code")).toBeNull();
	expect(view.getByTestId("detail-skeleton")).toBeTruthy();
	detail = { ...detail, projectId: "project", isResolvingProject: false };
	view.rerender(<Page />);
	await waitFor(() =>
		expect(view.getByTestId("code").getAttribute("data-project")).toBe(
			"project",
		),
	);
});
test("legacy project-only loading and errors are not mistaken for invalid links", () => {
	detail = {
		...detail,
		projectId: "project",
		repoFullName: null,
		data: undefined,
		isResolvingProject: false,
		isLoading: true,
	};
	const view = render(<Page />);
	expect(view.queryByText("This pull request link is invalid.")).toBeNull();
	detail = { ...detail, isLoading: false };
	view.rerender(<Page />);
	expect(view.getByText("Summary unavailable")).toBeTruthy();
	expect(view.queryByText("This pull request link is invalid.")).toBeNull();
});
